"""Explicit opt-in smoke test; sends only an original fictional technical answer."""

import os
from django.core.management.base import BaseCommand, CommandError
from backend.core.demo_questions import QUESTIONS
from evaluation.gemini import configured, ProviderError
from evaluation.scoring import evaluate


class Command(BaseCommand):
    help = (
        "Verify Gemini generation, embeddings, schema, and exact evidence using a fictional answer."
    )

    def handle(self, *args, **options):
        if not configured():
            raise CommandError(
                "GEMINI_API_KEY is missing. Add a free-tier key to .env; never commit it."
            )
        question = QUESTIONS[0]
        try:
            result = evaluate(question, question["expected_answer"], 100)
        except ProviderError as exc:
            raise CommandError(
                f"Gemini check failed: {exc.code}. Check model access and quota in AI Studio."
            ) from None
        self.stdout.write(
            self.style.SUCCESS(
                "Gemini embeddings, rubric grading, and verbatim evidence validation passed."
            )
        )
        self.stdout.write(
            f"Model: {os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite')} | Technical: {result['technical']:.1f}/100 | Semantic: {result['semantic']:.1f}/100"
        )
