import os
from datetime import timedelta
from urllib.parse import urlparse
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from evaluation.adaptive import select_question
from evaluation.gemini import configured, create_live_token, ProviderError
from .models import Invitation, Interview, Attempt, Job, WorkerStatus
from .serializers import StartInput, AnswerInput, TabInput, LiveTokenInput, validated
from .security import endpoint, request_limit, digest, Conflict, Unavailable, audit


def worker_ready():
    return WorkerStatus.objects.filter(
        name="primary", seen_at__gt=timezone.now() - timedelta(seconds=90)
    ).exists()


def invitation_for_token(token):
    invitation = get_object_or_404(
        Invitation.objects.select_related("drive", "drive__position"),
        token_hash=digest(token),
    )
    now = timezone.now()
    if (
        invitation.expires_at <= now
        or invitation.drive.expires_at <= now
        or invitation.drive.status != "active"
    ):
        raise Conflict(
            "This invitation is closed or expired. Contact your recruiter for a new invitation."
        )
    if invitation.drive.opens_at > now:
        raise Conflict(
            "This interview has not opened yet. Check the opening date with your recruiter."
        )
    return invitation


def check_candidate(request):
    if request.user.role != "candidate" or not request.user.verified:
        raise PermissionDenied("Sign in with a verified candidate account to take this interview.")


def get_interview(request, pk, lock=False):
    check_candidate(request)
    queryset = Interview.objects.select_related("invitation__drive", "invitation__drive__position")
    if lock:
        queryset = queryset.select_for_update()
    return get_object_or_404(queryset, pk=pk, candidate=request.user)


def check_tab(interview, tab):
    if interview.active_tab != tab:
        raise Conflict(
            "This interview is active in another tab. Use “Continue in this tab” to resume here."
        )
    interview.tab_seen_at = timezone.now()
    interview.save(update_fields=["tab_seen_at"])


def next_attempt(interview):
    attempts = list(
        interview.attempts.select_related("evaluation", "interview__invitation").order_by("ordinal")
    )
    drive = interview.invitation.drive
    if len(attempts) >= drive.question_count:
        interview.stop_reason = "question_limit"
    elif (
        interview.answering_seconds
        >= drive.duration_minutes * 60 * interview.invitation.accommodation_multiplier
    ):
        interview.stop_reason = "time_budget"
    else:
        question = select_question(
            drive.question_pool,
            attempts,
            drive.policy["skills"],
            interview.ability,
            str(interview.pk),
        )
        if question:
            previous = attempts[-1] if attempts else None
            previous_score = previous.evaluation.score if previous and hasattr(previous, "evaluation") else None
            previous_difficulty = previous.question.get("difficulty") if previous else None
            topic_counts = {}
            for item in attempts:
                topic_counts[item.question.get("topic", "")] = topic_counts.get(item.question.get("topic", ""), 0) + 1
            if not previous:
                explanation = "Started at a medium baseline so every candidate receives a comparable opening turn."
                trigger = "baseline"
            elif previous_score is not None and previous_score >= 78:
                explanation = "The previous answer was strong, so the engine increased challenge or explored the next coverage gap."
                trigger = "strong_answer"
            elif previous_score is not None and previous_score <= 48:
                explanation = "The previous answer left rubric gaps, so the engine reduced challenge or returned to an uncovered foundation."
                trigger = "weak_answer"
            else:
                explanation = "The engine kept challenge near the current ability while balancing topic coverage."
                trigger = "steady_answer"
            return Attempt.objects.create(
                interview=interview,
                ordinal=len(attempts) + 1,
                question=question,
                selection_reason={
                    "trigger": trigger,
                    "explanation": explanation,
                    "previous_score": previous_score,
                    "previous_difficulty": previous_difficulty,
                    "selected_difficulty": question.get("difficulty"),
                    "topic_counts": topic_counts,
                },
            )
        interview.stop_reason = "pool_exhausted"
    interview.status = "completed"
    interview.completed_at = timezone.now()
    interview.save()
    Job.objects.get_or_create(kind="report", target_id=interview.pk)
    return None


def state(interview):
    drive = interview.invitation.drive
    current = interview.attempts.order_by("-ordinal").first()
    data = {
        "id": str(interview.pk),
        "status": interview.status,
        "position": drive.policy.get("title", drive.position.title),
        "drive": drive.name,
        "question_count": drive.question_count,
        "completed_questions": interview.attempts.filter(evaluation__isnull=False).count(),
        "answering_seconds": interview.answering_seconds,
        "budget_seconds": drive.duration_minutes
        * 60
        * interview.invitation.accommodation_multiplier,
        "instructions": drive.instructions,
        "stop_reason": interview.stop_reason,
        "attempt": None,
        "processing": False,
        "processing_error": "",
        "server_time": timezone.now().isoformat(),
    }
    if current and interview.status == "in_progress":
        if current.submitted_at:
            job = Job.objects.filter(kind="evaluate", target_id=current.pk).first()
            data["processing"] = True
            data["processing_error"] = job.error_code if job else ""
            data["processing_failed"] = bool(job and job.state == "failed")
        else:
            data["attempt"] = {
                "id": str(current.pk),
                "ordinal": current.ordinal,
                "issued_at": current.issued_at.isoformat(),
                "draft": current.draft,
                **{
                    k: current.question[k]
                    for k in (
                        "title",
                        "topic",
                        "prompt",
                        "kind",
                        "language",
                        "starter_code",
                    )
                },
            }
    return data


@endpoint(["GET"], public=True)
def preview_invitation(request):
    request_limit(request, "invite_preview", 30, 600)
    token = request.query_params.get("token", "").strip()
    if not token or len(token) > 200:
        raise ValidationError("A valid invitation token is required.")
    invite = invitation_for_token(token)
    drive = invite.drive
    return Response(
        {
            "position": drive.policy.get("title", drive.position.title),
            "experience": drive.position.experience,
            "organization": drive.organization.name,
            "duration_minutes": round(drive.duration_minutes * invite.accommodation_multiplier),
            "question_count": drive.question_count,
            "instructions": drive.instructions,
            "expires_at": invite.expires_at,
            "redeemed": bool(invite.redeemed_at),
            "demo_data": drive.demo_data,
            "ai_ready": configured() and worker_ready(),
            "skills": [s["topic"] for s in drive.policy.get("skills", drive.position.skills)],
        }
    )


@endpoint(["GET"])
def my_interviews(request):
    check_candidate(request)
    interviews = (
        Interview.objects.filter(candidate=request.user)
        .select_related("invitation__drive__position")
        .order_by("-created_at")
    )
    invitations = Invitation.objects.filter(
        email__iexact=request.user.email,
        redeemed_at=None,
        expires_at__gt=timezone.now(),
    ).select_related("drive__position")
    return Response(
        {
            "interviews": [
                {
                    "id": str(i.pk),
                    "position": i.invitation.drive.position.title,
                    "drive": i.invitation.drive.name,
                    "status": i.status,
                    "created_at": i.created_at,
                    "expires_at": i.invitation.expires_at,
                    "question_count": i.invitation.drive.question_count,
                    "completed_questions": i.attempts.filter(evaluation__isnull=False).count(),
                    "duration_minutes": round(i.invitation.drive.duration_minutes * i.invitation.accommodation_multiplier),
                }
                for i in interviews
            ],
            "invitations": [
                {
                    "position": i.drive.position.title,
                    "drive": i.drive.name,
                    "expires_at": i.expires_at,
                    "organization": i.drive.organization.name,
                    "duration_minutes": round(i.drive.duration_minutes * i.accommodation_multiplier),
                    "question_count": i.drive.question_count,
                }
                for i in invitations
            ],
        }
    )


@endpoint(["POST"])
def start(request):
    check_candidate(request)
    request_limit(request, "interview_start", 5, 600)
    data = validated(StartInput, request)
    if not data["consent"]:
        raise ValidationError("Please accept the interview instructions to continue.")
    invite = invitation_for_token(data["token"])
    if invite.email.lower() != request.user.email.lower():
        raise PermissionDenied("This invitation belongs to a different candidate account.")
    if os.getenv("AI_DATA_POLICY", "demo_only") == "demo_only" and (
        not invite.drive.demo_data or not data["demo_acknowledged"]
    ):
        raise ValidationError(
            "This deployment accepts non-sensitive demonstration interviews only."
        )
    with transaction.atomic():
        invite = (
            Invitation.objects.select_for_update()
            .select_related("drive__position")
            .get(pk=invite.pk)
        )
        # A demo link may be regenerated after a candidate has already begun.
        # The invitation flag can be stale in that case, but the one-to-one
        # Interview row is authoritative and must be resumed instead of
        # attempting a second insert.
        existing = (
            Interview.objects.select_for_update()
            .filter(invitation=invite)
            .first()
        )
        if existing:
            if existing.candidate_id != request.user.pk:
                raise PermissionDenied("This invitation belongs to a different candidate account.")
            if not invite.redeemed_at:
                invite.redeemed_at = existing.created_at
                invite.save(update_fields=["redeemed_at"])
            interview = existing
            return Response({"id": str(interview.pk), "resumed": True})
        if not configured():
            raise Unavailable(
                "Interview evaluation is not configured yet. Your invitation remains available."
            )
        if not worker_ready():
            raise Unavailable("Interview processing is starting up. Please try again shortly.")
        interview = Interview.objects.create(
            invitation=invite,
            candidate=request.user,
            active_tab=data["tab_id"],
            tab_seen_at=timezone.now(),
        )
        invite.redeemed_at = timezone.now()
        invite.save()
        next_attempt(interview)
    audit(request, "interview_started", interview.pk)
    return Response({"id": str(interview.pk)}, status=201)


@endpoint(["GET"])
def interview_state(request, pk):
    return Response(state(get_interview(request, pk)))


@endpoint(["POST"])
def heartbeat(request, pk):
    data = validated(TabInput, request)
    with transaction.atomic():
        interview = get_interview(request, pk, True)
        if (
            data["take_over"]
            or interview.active_tab is None
            or (
                interview.tab_seen_at
                and interview.tab_seen_at < timezone.now() - timedelta(seconds=75)
            )
        ):
            interview.active_tab = data["tab_id"]
            interview.save(update_fields=["active_tab"])
        check_tab(interview, data["tab_id"])
        if data["focus_lost"]:
            interview.integrity_events += 1
            interview.save(update_fields=["integrity_events"])
    return Response({"ok": True})


@endpoint(["POST"])
def live_token(request, pk):
    """Authorize exactly one browser Live API connection for the active candidate turn."""
    request_limit(request, "live_token", 6, 600)
    origin = request.META.get("HTTP_ORIGIN", "")
    if origin:
        expected = urlparse(settings.PUBLIC_URL).netloc
        received = urlparse(origin).netloc
        if expected and received and expected != received:
            raise PermissionDenied("This live session can only be opened from HireLens.")
    data = validated(LiveTokenInput, request)
    with transaction.atomic():
        interview = get_interview(request, pk, True)
        check_tab(interview, data["tab_id"])
        attempt = interview.attempts.order_by("-ordinal").first()
        if interview.status != "in_progress" or not attempt or attempt.submitted_at:
            raise Conflict("There is no active question to join.")
    # Browser verification must never create a real Gemini Live connection. This
    # flag is intentionally useful only in the isolated DEBUG test process.
    if settings.DEBUG and os.getenv("HIRELENS_LIVE_TEST_MODE") == "fallback":
        raise Unavailable("The live interviewer is temporarily unavailable. Please try again.")
    try:
        issued = create_live_token(attempt.question)
    except ProviderError as exc:
        raise Unavailable(
            "The live interviewer is temporarily unavailable. Please try again."
        ) from exc
    audit(request, "live_session_authorized", attempt.pk)
    return Response({**issued, "attempt_id": str(attempt.pk)})


@endpoint(["PUT", "POST"])
def answer(request, pk):
    request_limit(request, "answer", 60)
    data = validated(AnswerInput, request)
    with transaction.atomic():
        interview = get_interview(request, pk, True)
        check_tab(interview, data["tab_id"])
        attempt = get_object_or_404(Attempt, pk=data["attempt_id"], interview=interview)
        if request.method == "POST" and not data.get("submission_id"):
            raise ValidationError({"submission_id": "Required when submitting an answer."})
        if attempt.submitted_at:
            if request.method == "POST" and attempt.submission_id == data["submission_id"]:
                return Response(state(interview), status=202)
            raise Conflict("This answer has already been submitted.")
        if interview.status != "in_progress":
            raise Conflict("This interview has ended.")
        remaining = (
            interview.invitation.drive.duration_minutes
            * 60
            * interview.invitation.accommodation_multiplier
            - interview.answering_seconds
        )
        elapsed = max(0, (timezone.now() - attempt.issued_at).total_seconds())
        if elapsed > remaining + 5:
            # Preserve the last timely autosave; late edits cannot extend the deadline.
            data["answer"] = attempt.draft
        if request.method == "PUT" and elapsed <= remaining:
            attempt.draft = data["answer"]
            attempt.save(update_fields=["draft"])
            return Response({"saved_at": timezone.now().isoformat()})
        if request.method == "PUT":
            raise Conflict("The answering time has ended. Your saved answer will be submitted.")
        attempt.answer = data["answer"]
        attempt.draft = ""
        attempt.elapsed_seconds = min(elapsed, max(0, remaining))
        attempt.submitted_at = timezone.now()
        attempt.submission_id = data["submission_id"]
        attempt.save()
        interview.answering_seconds += attempt.elapsed_seconds
        interview.save(update_fields=["answering_seconds"])
        Job.objects.get_or_create(kind="evaluate", target_id=attempt.pk)
    audit(request, "answer_submitted", attempt.pk)
    return Response(state(interview), status=202)


@endpoint(["POST"])
def retry_evaluation(request, pk):
    request_limit(request, "retry_evaluation", 3, 300)
    interview = get_interview(request, pk)
    attempt = interview.attempts.order_by("-ordinal").first()
    if not attempt or not attempt.submitted_at:
        raise Conflict("There is no evaluation to retry.")
    Job.objects.filter(kind="evaluate", target_id=attempt.pk, state="failed").update(
        state="pending", attempts=0, available_at=timezone.now(), error_code=""
    )
    return Response({"detail": "Evaluation retry requested."})
