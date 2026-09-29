from django.core.management.base import BaseCommand, CommandError

from backend.core.catalog import CATALOG_COUNT, iter_catalog, quality_issues
from backend.core.models import Question, User


class Command(BaseCommand):
    help = "Create the governed 4,320-question HireLens catalog for a recruiter workspace."

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
        for payload in iter_catalog():
            key = payload["catalog_key"]
            if Question.objects.filter(organization=organization, catalog_key=key).exists():
                continue
            normalized = " ".join(payload["prompt"].lower().split())
            if normalized in seen_prompts:
                raise CommandError(f"Duplicate catalog prompt: {key}")
            seen_prompts.add(normalized)
            issues = quality_issues(payload)
            if issues:
                raise CommandError(f"Quality checks failed for {key}: {', '.join(issues)}")
            Question.objects.create(organization=organization, **payload)
            created += 1
        total = Question.objects.filter(
            organization=organization,
            catalog_key__startswith="catalog-v1:",
            archived=False,
            quality_status="active",
        ).count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Catalog ready: {total}/{CATALOG_COUNT} active questions ({created} new)."
            )
        )
