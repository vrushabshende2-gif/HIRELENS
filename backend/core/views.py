import os
import secrets
import uuid
from collections import Counter
from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.response import Response
from evaluation.gemini import configured
from .models import (
    Organization,
    Position,
    Question,
    Drive,
    Invitation,
    Report,
    Job,
    ReviewDecision,
    OrganizationMembership,
    User,
)
from .serializers import (
    PositionInput,
    QuestionInput,
    DriveInput,
    InviteInput,
    ReviewInput,
    MembershipInput,
    validated,
)
from .security import endpoint, request_limit, digest, audit, Conflict
from .reporting import report_data, pdf_response, csv_response
from .interviews import worker_ready
from .catalog import CATALOG_COUNT, seed_catalog_batch


def org(request):
    owned = Organization.objects.filter(owner=request.user).first()
    if owned:
        return owned
    membership = OrganizationMembership.objects.filter(user=request.user).select_related("organization").first()
    return get_object_or_404(Organization, pk=membership.organization_id if membership else None)


def workspace_role(request, organization):
    if organization.owner_id == request.user.pk:
        return "owner"
    return OrganizationMembership.objects.filter(organization=organization, user=request.user).values_list("role", flat=True).first()


def snapshot(question):
    fields = [
        "title",
        "topic",
        "difficulty",
        "kind",
        "language",
        "prompt",
        "expected_answer",
        "concepts",
        "reasoning_criteria",
        "code_checks",
        "starter_code",
        "weight",
        "expected_seconds",
        "version",
    ]
    return {"id": str(question.pk), **{k: getattr(question, k) for k in fields}}


def drive_data(drive):
    invites = list(drive.invitations.select_related("interview__report"))
    completed = [
        i for i in invites if hasattr(i, "interview") and i.interview.status == "completed"
    ]
    scores = [i.interview.report.overall for i in completed if hasattr(i.interview, "report")]
    return {
        "id": str(drive.pk),
        "name": drive.name,
        "position_id": str(drive.position_id),
        "position": drive.position.title,
        "status": drive.status,
        "opens_at": drive.opens_at,
        "expires_at": drive.expires_at,
        "question_count": drive.question_count,
        "duration_minutes": drive.duration_minutes,
        "instructions": drive.instructions,
        "demo_data": drive.demo_data,
        "invited": len(invites),
        "completed": len(completed),
        "average_score": round(sum(scores) / len(scores), 1) if scores else None,
        "skills": drive.policy.get("skills", drive.position.skills),
        "created_at": drive.created_at,
    }


def candidate_data(invite):
    interview = getattr(invite, "interview", None)
    report = getattr(interview, "report", None) if interview else None
    return {
        "id": str(invite.pk),
        "name": invite.name,
        "email": invite.email,
        "status": interview.status if interview else "invited",
        "score": report.overall if report else None,
        "recommendation": report.recommendation if report else None,
        "report_id": str(report.pk) if report else None,
        "drive_id": str(invite.drive_id),
        "drive": invite.drive.name,
        "position": invite.drive.position.title,
        "time_seconds": interview.answering_seconds if interview else None,
        "created_at": invite.created_at,
        "expires_at": invite.expires_at,
        "progress": interview.attempts.filter(evaluation__isnull=False).count() if interview else 0,
        "question_count": invite.drive.question_count,
    }


@endpoint(["GET"], recruiter=True)
def overview(request):
    organization = org(request)
    drives = list(
        Drive.objects.filter(organization=organization)
        .select_related("position")
        .order_by("-created_at")
    )
    invites = (
        Invitation.objects.filter(drive__organization=organization)
        .select_related("drive__position", "interview__report")
        .order_by("-created_at")
    )
    rows = [candidate_data(i) for i in invites]
    scores = [r["score"] for r in rows if r["score"] is not None]
    completed = sum(r["status"] == "completed" for r in rows)
    return Response(
        {
            "stats": {
                "candidates": len(rows),
                "completed": completed,
                "completion_rate": round(100 * completed / len(rows)) if rows else 0,
                "average_score": round(sum(scores) / len(scores), 1) if scores else 0,
                "active_drives": sum(
                    d.status == "active" and d.expires_at > timezone.now() for d in drives
                ),
            },
            "drives": [drive_data(d) for d in drives],
            "recent_candidates": rows[:6],
            "ai": {
                "configured": configured(),
                "worker_ready": worker_ready(),
                "model": os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
                "data_policy": os.getenv("AI_DATA_POLICY", "demo_only"),
            },
            "organization": organization.name,
        }
    )


@endpoint(["GET", "POST"], recruiter=True)
def positions(request):
    organization = org(request)
    if request.method == "GET":
        return Response(
            PositionInput(
                Position.objects.filter(organization=organization).order_by("-created_at"),
                many=True,
            ).data
        )
    serializer = PositionInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    record = serializer.save(organization=organization)
    audit(request, "position_created", record.pk)
    return Response(serializer.data, status=201)


@endpoint(["GET", "POST"], recruiter=True)
def workspace_members(request):
    organization = org(request)
    role = workspace_role(request, organization)
    if request.method == "GET":
        members = [{"id": str(organization.owner_id), "name": organization.owner.first_name, "email": organization.owner.email, "role": "owner"}]
        members += [
            {"id": str(m.user_id), "name": m.user.first_name, "email": m.user.email, "role": m.role}
            for m in organization.memberships.select_related("user").order_by("created_at")
        ]
        return Response(members)
    if role not in {"owner", "admin"}:
        raise PermissionDenied("Only workspace owners and admins can manage members.")
    data = validated(MembershipInput, request)
    user = get_object_or_404(User, email__iexact=data["email"], role="recruiter", verified=True)
    if user.pk == organization.owner_id:
        raise ValidationError("The workspace owner already has owner access.")
    membership, _ = OrganizationMembership.objects.update_or_create(
        organization=organization, user=user, defaults={"role": data["role"]}
    )
    audit(request, "workspace_member_updated", membership.pk)
    return Response({"id": str(user.pk), "name": user.first_name, "email": user.email, "role": membership.role}, status=201)


@endpoint(["DELETE"], recruiter=True)
def workspace_member_detail(request, pk):
    organization = org(request)
    if workspace_role(request, organization) not in {"owner", "admin"}:
        raise PermissionDenied("Only workspace owners and admins can manage members.")
    membership = get_object_or_404(OrganizationMembership, pk=pk, organization=organization)
    membership.delete()
    audit(request, "workspace_member_removed", pk)
    return Response(status=204)


@endpoint(["PATCH", "DELETE"], recruiter=True)
def position_detail(request, pk):
    position = get_object_or_404(Position, pk=pk, organization=org(request))
    if request.method == "DELETE":
        position.archived = True
        position.save(update_fields=["archived"])
        return Response(status=204)
    serializer = PositionInput(position, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    audit(request, "position_updated", position.pk)
    return Response(serializer.data)


@endpoint(["GET", "POST"], recruiter=True)
def questions(request):
    organization = org(request)
    if request.method == "GET":
        queryset = Question.objects.filter(organization=organization).order_by(
            "topic", "difficulty", "title"
        )
        search = request.query_params.get("search", "").strip()[:120]
        if search:
            queryset = queryset.filter(title__icontains=search) | queryset.filter(
                topic__icontains=search
            )
        topic = request.query_params.get("topic", "").strip()[:60]
        if topic:
            queryset = queryset.filter(topic=topic)
        difficulty = request.query_params.get("difficulty", "")
        if difficulty in {"-1", "0", "1"}:
            queryset = queryset.filter(difficulty=int(difficulty))
        count = queryset.count()
        try:
            limit = min(200, max(1, int(request.query_params.get("limit", "100"))))
            offset = max(0, int(request.query_params.get("offset", "0")))
        except ValueError:
            raise ValidationError("limit and offset must be valid integers.")
        rows = queryset[offset : offset + limit]
        return Response(
            {
                "results": QuestionInput(rows, many=True).data,
                "count": count,
                "offset": offset,
                "limit": limit,
                "next_offset": offset + limit if offset + limit < count else None,
            }
        )
    serializer = QuestionInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    record = serializer.save(organization=organization)
    audit(request, "question_created", record.pk)
    return Response(serializer.data, status=201)


@endpoint(["PATCH", "DELETE"], recruiter=True)
def question_detail(request, pk):
    question = get_object_or_404(Question, pk=pk, organization=org(request))
    if request.method == "DELETE":
        question.archived = True
        question.save(update_fields=["archived"])
        return Response(status=204)
    serializer = QuestionInput(question, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save(version=question.version + 1)
    audit(request, "question_updated", question.pk)
    return Response(serializer.data)


@endpoint(["GET", "POST"], recruiter=True)
def question_catalog(request):
    """Report or incrementally initialize the governed catalog without a server shell."""
    organization = org(request)
    if request.method == "POST":
        request_limit(request, "catalog_seed", 30, 300)
        result = seed_catalog_batch(organization)
        audit(request, "question_catalog_seeded", organization.pk)
    else:
        result = {
            "created": 0,
            "total": Question.objects.filter(
                organization=organization,
                catalog_key__startswith="catalog-v1:",
                archived=False,
                quality_status="active",
            ).count(),
            "expected": CATALOG_COUNT,
        }
        result["complete"] = result["total"] >= CATALOG_COUNT
    return Response(result)


@endpoint(["GET", "POST"], recruiter=True)
def drives(request):
    organization = org(request)
    if request.method == "GET":
        return Response(
            [
                drive_data(d)
                for d in Drive.objects.filter(organization=organization)
                .select_related("position")
                .order_by("-created_at")
            ]
        )
    data = validated(DriveInput, request)
    position = get_object_or_404(
        Position, pk=data.pop("position_id"), organization=organization, archived=False
    )
    drive = Drive.objects.create(organization=organization, position=position, **data)
    audit(request, "drive_created", drive.pk)
    return Response(drive_data(drive), status=201)


@endpoint(["GET", "PATCH"], recruiter=True)
def drive_detail(request, pk):
    drive = get_object_or_404(
        Drive.objects.select_related("position"), pk=pk, organization=org(request)
    )
    if request.method == "PATCH":
        if drive.status != "draft":
            raise Conflict(
                "Published drives have a frozen interview policy. Create a new drive to change it."
            )
        serializer = DriveInput(drive, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if "position_id" in serializer.validated_data:
            get_object_or_404(
                Position,
                pk=serializer.validated_data["position_id"],
                organization=drive.organization,
            )
        serializer.save()
    result = drive_data(drive)
    result["candidates"] = [
        candidate_data(i)
        for i in drive.invitations.select_related("interview__report", "drive__position").order_by(
            "-created_at"
        )
    ]
    return Response(result)


@endpoint(["POST"], recruiter=True)
def publish(request, pk):
    with transaction.atomic():
        drive = get_object_or_404(
            Drive.objects.select_for_update().select_related("position"),
            pk=pk,
            organization=org(request),
        )
        if drive.status != "draft":
            raise Conflict("This drive has already been published.")
        if drive.expires_at <= timezone.now():
            raise ValidationError("Update the expiry date before publishing.")
        position = drive.position
        topics = [s["topic"] for s in position.skills]
        pool = list(
            Question.objects.filter(
                organization=drive.organization,
                archived=False,
                topic__in=topics,
                difficulty__gte=position.difficulty_min,
                difficulty__lte=position.difficulty_max,
            )
        )
        if len(pool) < drive.question_count or drive.question_count < len(topics):
            raise ValidationError(
                "This drive needs more active questions for its target topics. Open Question Bank and initialize the governed catalog, then use matching catalog topic names such as Machine Learning or Python."
            )
        for topic in topics:
            if not any(q.topic == topic and q.difficulty == 0 for q in pool):
                raise ValidationError(f"Add a medium question for {topic} before publishing.")
        drive.question_pool = [snapshot(q) for q in pool]
        drive.policy = {
            "title": position.title,
            "skills": position.skills,
            "scoring_version": "2026-09-v1",
            "hire_threshold": 75,
            "borderline_threshold": 55,
            "difficulty_min": position.difficulty_min,
            "difficulty_max": position.difficulty_max,
        }
        drive.status = "active"
        drive.save()
    audit(request, "drive_published", drive.pk)
    return Response(drive_data(drive))


@endpoint(["POST"], recruiter=True)
def close_drive(request, pk):
    drive = get_object_or_404(Drive, pk=pk, organization=org(request))
    drive.status = "closed"
    drive.save(update_fields=["status"])
    audit(request, "drive_closed", drive.pk)
    return Response({"detail": "Drive closed to new interviews. Active candidates can finish."})


@endpoint(["POST"], recruiter=True)
def invite(request, pk):
    request_limit(request, "invite", 30, 3600)
    drive = get_object_or_404(Drive, pk=pk, organization=org(request), status="active")
    if drive.expires_at <= timezone.now():
        raise Conflict("This drive has expired.")
    data = validated(InviteInput, request)
    send_email = data.pop("send_email")
    token = secrets.token_urlsafe(32)
    try:
        with transaction.atomic():
            invitation = Invitation.objects.create(
                drive=drive,
                email=data["email"].lower(),
                name=data["name"],
                accommodation_multiplier=data["accommodation_multiplier"],
                token_hash=digest(token),
                expires_at=drive.expires_at,
            )
            from django.conf import settings

            link = f"{settings.PUBLIC_URL}/invite#token={token}"
            if send_email:
                Job.objects.create(
                    kind="email",
                    target_id=invitation.pk,
                    payload={
                        "recipient": invitation.email,
                        "subject": f"Your interview invitation: {drive.position.title}",
                        "body": f"You have been invited to interview for {drive.position.title}.\n\n{link}\n\nSign in with this email address. This invitation expires on {drive.expires_at.date()}.",
                    },
                )
    except IntegrityError:
        raise ValidationError("This candidate already has an invitation for this drive.")
    audit(request, "invitation_created", invitation.pk)
    return Response(
        {"id": str(invitation.pk), "link": link, "email_queued": send_email}, status=201
    )


@endpoint(["GET"], recruiter=True)
def candidates(request):
    invites = (
        Invitation.objects.filter(drive__organization=org(request))
        .select_related("drive__position", "interview__report")
        .order_by("-created_at")
    )
    return Response([candidate_data(i) for i in invites])


@endpoint(["GET"], recruiter=True)
def report(request, pk):
    record = get_object_or_404(
        Report.objects.select_related("interview__invitation__drive__position"),
        pk=pk,
        interview__invitation__drive__organization=org(request),
    )
    audit(request, "report_accessed", record.pk)
    return Response(report_data(record))


@endpoint(["POST"], recruiter=True)
def review(request, pk):
    record = get_object_or_404(
        Report, pk=pk, interview__invitation__drive__organization=org(request)
    )
    data = validated(ReviewInput, request)
    ReviewDecision.objects.create(report=record, reviewer=request.user, **data)
    audit(request, "report_reviewed", record.pk)
    return Response({"detail": "Your review has been recorded."}, status=201)


@endpoint(["POST"], recruiter=True)
def retry_report(request, pk):
    request_limit(request, "report_retry", 3, 300)
    record = get_object_or_404(
        Report, pk=pk, interview__invitation__drive__organization=org(request)
    )
    Job.objects.filter(kind="report", target_id=record.interview_id, state="failed").update(
        state="pending", attempts=0, available_at=timezone.now(), error_code=""
    )
    record.narrative_status = "pending"
    record.save(update_fields=["narrative_status"])
    return Response({"detail": "Report generation queued."})


@endpoint(["GET"], recruiter=True)
def export_report(request, pk, kind):
    request_limit(request, "export", 20, 300)
    record = get_object_or_404(
        Report.objects.select_related("interview__invitation__drive__position"),
        pk=pk,
        interview__invitation__drive__organization=org(request),
    )
    data = report_data(record)
    audit(request, "report_exported", record.pk)
    if kind == "pdf":
        return pdf_response(data)
    if kind == "csv":
        return csv_response(
            [
                [
                    "Question",
                    "Topic",
                    "Difficulty",
                    "Answer",
                    "Time seconds",
                    "Score",
                    "Technical",
                    "Reasoning",
                    "Communication",
                ]
            ]
            + [
                [
                    a["question"]["title"],
                    a["question"]["topic"],
                    a["question"]["difficulty"],
                    a["answer"],
                    round(a["elapsed_seconds"]),
                    *[
                        a["evaluation"][k] if a["evaluation"] else ""
                        for k in ("score", "technical", "reasoning", "communication")
                    ],
                ]
                for a in data["transcript"]
            ],
            "hirelens-transcript.csv",
        )
    raise ValidationError("Supported exports: pdf, csv.")


@endpoint(["GET"], recruiter=True)
def analytics(request):
    organization = org(request)
    drives = (
        Drive.objects.filter(organization=organization)
        .select_related("position")
        .order_by("-created_at")
    )
    selected = request.query_params.get("drive", "")
    invites = Invitation.objects.filter(drive__organization=organization).select_related(
        "drive__position", "interview__report"
    )
    if selected:
        try:
            selected = uuid.UUID(selected)
        except ValueError:
            raise ValidationError("Invalid drive identifier.")
        get_object_or_404(Drive, pk=selected, organization=organization)
        invites = invites.filter(drive_id=selected)
    rows = [candidate_data(i) for i in invites]
    reports = list(Report.objects.filter(interview__invitation__in=invites))
    scores = [r.overall for r in reports]
    times = [r["time_seconds"] for r in rows if r["status"] == "completed"]
    bins = [
        {
            "label": f"{i}–{i + 19 if i < 80 else 100}",
            "count": sum(i <= s < (i + 20 if i < 80 else 101) for s in scores),
        }
        for i in range(0, 100, 20)
    ]
    topics = {}
    for r in reports:
        for t in r.topics:
            if t["count"]:
                topics.setdefault(t["topic"], []).append(t["score"])
    result = {
        "drives": [{"id": str(d.pk), "name": d.name} for d in drives],
        "candidates": rows,
        "distribution": bins,
        "topics": [
            {"topic": t, "score": round(sum(v) / len(v), 1), "candidates": len(v)}
            for t, v in topics.items()
        ],
        "average_score": round(sum(scores) / len(scores), 1) if scores else 0,
        "average_seconds": round(sum(times) / len(times)) if times else 0,
        "completion_rate": round(100 * len(times) / len(rows)) if rows else 0,
        "recommendations": dict(Counter(r.recommendation for r in reports)),
        "total": len(rows),
    }
    if request.query_params.get("export") == "csv":
        audit(request, "drive_exported", selected or "all")
        return csv_response(
            [
                [
                    "Candidate",
                    "Email",
                    "Drive",
                    "Status",
                    "Score",
                    "Recommendation",
                    "Time seconds",
                ]
            ]
            + [
                [
                    r[k]
                    for k in (
                        "name",
                        "email",
                        "drive",
                        "status",
                        "score",
                        "recommendation",
                        "time_seconds",
                    )
                ]
                for r in rows
            ],
            "hirelens-candidates.csv",
        )
    return Response(result)


@endpoint(["GET"], public=True)
def health(request):
    return Response({"status": "ok"})
