from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from backend.core.models import Attempt, AuthToken, AuditEvent, RateBucket


class Command(BaseCommand):
    help = "Remove retained interview answer text and expired authentication tokens."

    def handle(self, *args, **options):
        now = timezone.now()
        redacted = 0
        attempts = Attempt.objects.select_related("interview__candidate")
        for attempt in attempts.iterator(chunk_size=500):
            retention = attempt.interview.candidate.transcript_retention_days
            if attempt.submitted_at and attempt.submitted_at < now - timedelta(days=retention) and attempt.answer:
                attempt.answer = "[Transcript removed according to candidate retention preference]"
                attempt.draft = ""
                attempt.save(update_fields=["answer", "draft"])
                redacted += 1
        expired, _ = AuthToken.objects.filter(expires_at__lte=now).delete()
        audit_deleted, _ = AuditEvent.objects.filter(created_at__lt=now - timedelta(days=365)).delete()
        buckets_deleted, _ = RateBucket.objects.filter(expires_at__lt=now - timedelta(hours=1)).delete()
        self.stdout.write(self.style.SUCCESS(f"Retention complete: redacted {redacted} transcripts; removed {expired} expired auth records, {audit_deleted} old audit events, and {buckets_deleted} expired rate buckets."))
