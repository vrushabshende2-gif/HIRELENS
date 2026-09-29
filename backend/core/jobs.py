import os
import uuid
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from evaluation.gemini import ProviderError, report_narrative
from evaluation.scoring import evaluate
from evaluation.adaptive import update_state
from .models import Job, Attempt, Evaluation, Interview, Report, WorkerStatus
from .reporting import build_report
from .interviews import next_attempt
from .mailer import send_email


def claim_job():
    now = timezone.now()
    with transaction.atomic():
        query = Job.objects.filter(
            Q(state="pending", available_at__lte=now) | Q(state="running", lease_until__lt=now)
        ).order_by("available_at")
        from django.db import connection

        job = (
            query.select_for_update(skip_locked=True).first()
            if connection.features.has_select_for_update_skip_locked
            else query.select_for_update().first()
        )
        if not job:
            return None
        job.state = "running"
        job.lease_until = now + timedelta(minutes=5)
        job.lease_token = uuid.uuid4()
        job.attempts += 1
        job.save()
        return job


def process_job(job):
    if job.kind == "email":
        send_email(job.payload, job.pk)
    elif job.kind == "evaluate":
        attempt = Attempt.objects.select_related("interview__invitation__drive").get(
            pk=job.target_id
        )
        if not Evaluation.objects.filter(attempt=attempt).exists():
            result = evaluate(
                attempt.question,
                attempt.answer,
                attempt.elapsed_seconds,
                attempt.interview.invitation.accommodation_multiplier,
            )
            with transaction.atomic():
                locked = Job.objects.select_for_update().get(pk=job.pk)
                if locked.lease_token != job.lease_token:
                    return
                interview = (
                    Interview.objects.select_for_update()
                    .select_related("invitation__drive")
                    .get(pk=attempt.interview_id)
                )
                evaluation, created = Evaluation.objects.get_or_create(
                    attempt=attempt,
                    defaults={
                        **result,
                        "model": os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
                    },
                )
                if created:
                    interview.ability = update_state(
                        interview.ability,
                        attempt.question,
                        evaluation.score / 100,
                        evaluation.technical / 100,
                    )
                    interview.save(update_fields=["ability"])
                    next_attempt(interview)
    elif job.kind == "report":
        interview = Interview.objects.select_related("invitation__drive").get(pk=job.target_id)
        report, attempts = build_report(interview)
        if report.narrative_status != "complete":
            narrative = report_narrative(report, attempts)
            with transaction.atomic():
                locked = Job.objects.select_for_update().get(pk=job.pk)
                if locked.lease_token != job.lease_token:
                    return
                report.strengths = [v.model_dump() for v in narrative.strengths]
                report.weaknesses = [v.model_dump() for v in narrative.weaknesses]
                report.summary = narrative.summary
                report.narrative_status = "complete"
                report.save()
    Job.objects.filter(pk=job.pk, lease_token=job.lease_token).update(
        state="done", error_code="", payload={}, lease_until=None
    )


def run_one():
    WorkerStatus.objects.update_or_create(name="primary", defaults={"seen_at": timezone.now()})
    job = claim_job()
    if not job:
        return False
    try:
        process_job(job)
    except Exception as exc:
        error = exc if isinstance(exc, ProviderError) else ProviderError("processing_failed", 60)
        quota = error.code in (
            "ai_rate_limited",
            "ai_quota_wait",
            "ai_not_configured",
            "email_rate_limited",
        )
        failed = job.attempts >= 4 and not quota
        Job.objects.filter(pk=job.pk, lease_token=job.lease_token).update(
            state="failed" if failed else "pending",
            available_at=timezone.now() + timedelta(seconds=error.retry_after),
            error_code=error.code,
            lease_until=None,
        )
        if failed and job.kind == "report":
            Report.objects.filter(interview_id=job.target_id).update(narrative_status="failed")
        import logging

        logging.getLogger("hirelens").warning(
            "job_failed kind=%s code=%s exception_type=%s",
            job.kind,
            error.code,
            type(exc).__name__,
        )
    return True


def expire_answers():
    candidates = list(
        Attempt.objects.filter(submitted_at=None, interview__status="in_progress")
        .select_related("interview__invitation__drive")
        .order_by("issued_at")[:500]
    )
    for attempt in candidates:
        interview = attempt.interview
        budget = (
            interview.invitation.drive.duration_minutes
            * 60
            * interview.invitation.accommodation_multiplier
        )
        remaining = max(0, budget - interview.answering_seconds)
        if (timezone.now() - attempt.issued_at).total_seconds() <= remaining + 5:
            continue
        with transaction.atomic():
            interview = Interview.objects.select_for_update().get(pk=interview.pk)
            attempt = Attempt.objects.select_for_update().get(pk=attempt.pk)
            if attempt.submitted_at:
                continue
            attempt.answer = attempt.draft
            attempt.draft = ""
            attempt.submitted_at = timezone.now()
            attempt.elapsed_seconds = remaining
            attempt.submission_id = uuid.uuid4()
            attempt.save()
            interview.answering_seconds = budget
            interview.save(update_fields=["answering_seconds"])
            Job.objects.get_or_create(kind="evaluate", target_id=attempt.pk)
