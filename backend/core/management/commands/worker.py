import time
import threading
import logging
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from django.utils import timezone
from backend.core.models import WorkerStatus, RateBucket
from backend.core.jobs import run_one, expire_answers


class Command(BaseCommand):
    help = "Run the durable HireLens evaluation and email worker."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        self.stdout.write("HireLens worker ready.")

        # Keep readiness accurate while the main thread waits on an external API.
        def heartbeat():
            while True:
                close_old_connections()
                try:
                    WorkerStatus.objects.update_or_create(
                        name="primary", defaults={"seen_at": timezone.now()}
                    )
                except Exception as exc:
                    # A failed heartbeat expires naturally; never claim readiness on error.
                    logging.getLogger("hirelens").warning(
                        "worker_heartbeat_failed exception_type=%s", type(exc).__name__
                    )
                time.sleep(20)

        if not options["once"]:
            threading.Thread(target=heartbeat, daemon=True).start()
        last_expiry = 0
        last_prune = 0
        while True:
            close_old_connections()
            if time.monotonic() - last_expiry > 15:
                expire_answers()
                last_expiry = time.monotonic()
            if time.monotonic() - last_prune > 300:
                RateBucket.objects.filter(expires_at__lt=timezone.now() - timedelta(minutes=10)).delete()
                last_prune = time.monotonic()
            worked = run_one()
            if options["once"]:
                break
            if not worked:
                time.sleep(2)
