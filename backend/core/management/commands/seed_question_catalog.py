from django.core.management.base import BaseCommand, CommandError

from backend.core.catalog import CATALOG_COUNT, CATALOG_PREFIX, iter_catalog, quality_issues
from backend.core.models import Question, User


class Command(BaseCommand):
    help = "Create the governed, versioned HireLens skill catalog for a recruiter workspace."

    def add_arguments(self, parser):
        parser.add_argument("--email", default="recruiter@example.com")
        parser.add_argument("--organization", default="")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        user = User.objects.filter(
            email=options["email"], role="recruiter"
        ).select_related("organization").first()
        if not user:
            raise CommandError(f"Recruiter {options['email']} was not found.")
        organization = user.organization
        if options["organization"] and organization.name != options["organization"]:
            raise CommandError("The recruiter does not own the requested organization.")
        if options["dry_run"]:
            self.stdout.write(f"Would validate and seed {CATALOG_COUNT} governed questions.")
            return
        created = 0
        seen_prompts = set()
        existing = set(Question.objects.filter(
            organization=organization, catalog_key__startswith=CATALOG_PREFIX
        ).values_list("catalog_key", flat=True))
        batch = []
        for payload in iter_catalog():
            key = payload["catalog_key"]
            if key in existing:
                continue
            normalized = " ".join(payload["prompt"].lower().split())
            if normalized in seen_prompts:
                raise CommandError(f"Duplicate catalog prompt: {key}")
            seen_prompts.add(normalized)
            issues = quality_issues(payload)
            if issues:
                raise CommandError(f"Quality checks failed for {key}: {', '.join(issues)}")
            batch.append(Question(organization=organization, **payload))
            existing.add(key)
            if len(batch) >= 300:
                Question.objects.bulk_create(batch, batch_size=100)
                created += len(batch)
                batch.clear()
        if batch:
            Question.objects.bulk_create(batch, batch_size=100)
            created += len(batch)
        total = Question.objects.filter(
            organization=organization,
            catalog_key__startswith=CATALOG_PREFIX,
            archived=False,
            quality_status="active",
        ).count()
        if total >= CATALOG_COUNT:
            Question.objects.filter(
                organization=organization,
                catalog_key__startswith="catalog-v1:",
                archived=False,
            ).update(archived=True)
        self.stdout.write(
            self.style.SUCCESS(
                f"Catalog ready: {total}/{CATALOG_COUNT} active questions ({created} new)."
            )
        )
