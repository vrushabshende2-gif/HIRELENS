import json
import secrets
from datetime import timedelta
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from backend.core.models import (
    User,
    Organization,
    Position,
    Question,
    Drive,
    Invitation,
    Interview,
    Attempt,
    Evaluation,
)
from backend.core.security import digest
from backend.core.views import snapshot
from backend.core.reporting import build_report
from backend.core.demo_questions import QUESTIONS
from evaluation.adaptive import select_question, update_state


class Command(BaseCommand):
    help = "Seed an explicitly fictional demo workspace; access details are written to ignored .runtime/demo-access.json."

    def add_arguments(self, parser):
        parser.add_argument("--access-file", default=".runtime/demo-access.json")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Demo seeding is disabled outside development mode.")
        path = settings.BASE_DIR / options["access_file"]
        if User.objects.filter(email="recruiter@example.com").exists():
            self.stdout.write(
                f"Demo already exists. Access details: {path.relative_to(settings.BASE_DIR)}"
            )
            return
        password = secrets.token_urlsafe(16) + "!7a"
        candidate_password = secrets.token_urlsafe(16) + "!8b"
        now = timezone.now()
        with transaction.atomic():
            recruiter = User.objects.create_user(
                username="demo-recruiter",
                email="recruiter@example.com",
                password=password,
                first_name="Mira Shah",
                role="recruiter",
                verified=True,
            )
            organization = Organization.objects.create(owner=recruiter, name="Acme Studio")
            skills = [
                {"topic": "JavaScript", "weight": 1, "minimum": 40},
                {"topic": "API design", "weight": 1, "minimum": 40},
                {"topic": "Databases", "weight": 1, "minimum": 40},
            ]
            position = Position.objects.create(
                organization=organization,
                title="Backend Engineer — Node.js",
                description="Build thoughtful APIs, reliable services, and the systems that keep our product moving. We value clear reasoning as much as technical depth.",
                experience="Mid-level",
                skills=skills,
            )
            frontend = Position.objects.create(
                organization=organization,
                title="Frontend Engineer — React",
                description="Create accessible, responsive interfaces and bring complex product experiences to life.",
                experience="Mid-level",
                skills=[
                    {"topic": "JavaScript", "weight": 2, "minimum": 50},
                    {"topic": "API design", "weight": 1, "minimum": 40},
                ],
            )
            questions = [Question.objects.create(organization=organization, **q) for q in QUESTIONS]
            policy = {
                "title": position.title,
                "skills": skills,
                "scoring_version": "2026-09-v1",
                "hire_threshold": 75,
                "borderline_threshold": 55,
            }
            drive = Drive.objects.create(
                organization=organization,
                position=position,
                name="Backend hiring · September",
                status="active",
                opens_at=now - timedelta(days=6),
                expires_at=now + timedelta(days=30),
                question_count=12,
                duration_minutes=35,
                question_pool=[snapshot(q) for q in questions],
                policy=policy,
                demo_data=True,
            )
            Drive.objects.create(
                organization=organization,
                position=frontend,
                name="Frontend team · Autumn",
                status="draft",
                expires_at=now + timedelta(days=45),
                question_count=8,
                duration_minutes=25,
                demo_data=True,
            )
            profiles = [
                ("Alex Morgan", 0.96),
                ("Jordan Blake", 0.83),
                ("Sam Rivera", 0.74),
                ("Taylor Quinn", 0.61),
                ("Casey Ellis", 0.44),
                ("Riley Parker", 0.88),
            ]
            for index, (name, quality) in enumerate(profiles):
                email = name.lower().replace(" ", ".") + "@example.com"
                user = User.objects.create_user(
                    username="sample-" + str(index),
                    email=email,
                    password=secrets.token_urlsafe(32),
                    first_name=name,
                    role="candidate",
                    verified=True,
                )
                invite = Invitation.objects.create(
                    drive=drive,
                    name=name,
                    email=email,
                    token_hash=digest(secrets.token_urlsafe(32)),
                    expires_at=drive.expires_at,
                    redeemed_at=now - timedelta(days=index + 1),
                    created_at=now - timedelta(days=index + 2),
                )
                interview = Interview.objects.create(
                    invitation=invite,
                    candidate=user,
                    status="completed",
                    completed_at=now - timedelta(hours=index * 7 + 2),
                    created_at=now - timedelta(hours=index * 7 + 3),
                    stop_reason="question_limit",
                )
                attempts = []
                for n in range(12):
                    question = select_question(
                        drive.question_pool,
                        attempts,
                        skills,
                        interview.ability,
                        str(interview.pk),
                    )
                    answer = question["expected_answer"]
                    if quality < 0.8 and question["kind"] == "text":
                        sentences = answer.split(". ")
                        answer = ". ".join(sentences[: max(1, int(len(sentences) * quality))]) + "."
                    elapsed = 100 + ((n * 23 + index * 11) % 100)
                    attempt = Attempt.objects.create(
                        interview=interview,
                        ordinal=n + 1,
                        question=question,
                        answer=answer,
                        issued_at=interview.created_at + timedelta(seconds=n * 160),
                        submitted_at=interview.created_at + timedelta(seconds=n * 160 + elapsed),
                        elapsed_seconds=elapsed,
                    )
                    score = max(12, min(98, quality * 100 + (n % 3 - 1) * 7))
                    quote = answer.split(". ")[0][:500]
                    evidence = [
                        {
                            "concept": c["name"],
                            "coverage": 1 if score > 75 else 0.5,
                            "quote": quote,
                            "start": 0,
                            "end": len(quote),
                            "explanation": "Illustrative rubric evidence for this fictional demonstration answer.",
                            "contradiction": False,
                        }
                        for c in question["concepts"]
                    ]
                    Evaluation.objects.create(
                        attempt=attempt,
                        score=score,
                        technical=score,
                        reasoning=score,
                        communication=min(98, score + 5),
                        efficiency=score * 0.9,
                        semantic=score,
                        coverage=score,
                        code_structure=90 if question["kind"] == "code" else None,
                        evidence=evidence,
                        feedback="This fictional response illustrates how HireLens presents rubric evidence. Live interviews use Gemini assessment; these sample scores were seeded for demonstration.",
                        confidence="medium",
                        model="illustrative-demo-fixture",
                        flags=["static_analysis_only"] if question["kind"] == "code" else [],
                    )
                    interview.ability = update_state(
                        interview.ability, question, score / 100, score / 100
                    )
                    interview.answering_seconds += elapsed
                    attempts.append(attempt)
                interview.save()
                report, _ = build_report(interview)
                report.source = "seed"
                report.narrative_status = "complete"
                report.summary = (
                    f"{name.split()[0]} demonstrates "
                    + (
                        "a strong grasp of the core engineering principles, with clear explanations of implementation trade-offs."
                        if quality > 0.8
                        else "developing technical understanding, with useful foundations and areas that would benefit from a follow-up conversation."
                    )
                    + " Review the cited answers below to guide the next conversation. This is an illustrative report using fictional data."
                )
                report.strengths = [
                    {
                        "attempt_id": str(a.pk),
                        "quote": a.answer.split(". ")[0][:400],
                        "observation": f"Addresses the central idea in {a.question['topic']}: {a.question['concepts'][0]['name'].lower()}.",
                    }
                    for a in attempts[:2]
                ]
                report.weaknesses = [
                    {
                        "attempt_id": str(attempts[2].pk),
                        "quote": attempts[2].answer.split(". ")[0][:400],
                        "observation": "Use a follow-up question to explore how this approach behaves under failure and at larger scale.",
                    }
                ]
                report.save()
            for name in ["Jamie Chen", "Drew Avery"]:
                Invitation.objects.create(
                    drive=drive,
                    name=name,
                    email=name.lower().replace(" ", ".") + "@example.com",
                    token_hash=digest(secrets.token_urlsafe(32)),
                    expires_at=drive.expires_at,
                )
            candidate = User.objects.create_user(
                username="demo-candidate",
                email="candidate@example.com",
                password=candidate_password,
                first_name="Demo Candidate",
                role="candidate",
                verified=True,
            )
            token = secrets.token_urlsafe(32)
            Invitation.objects.create(
                drive=drive,
                name=candidate.first_name,
                email=candidate.email,
                token_hash=digest(token),
                expires_at=drive.expires_at,
            )
        path.parent.mkdir(exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "recruiter": {"email": recruiter.email, "password": password},
                    "candidate": {
                        "email": candidate.email,
                        "password": candidate_password,
                    },
                    "invite_url": settings.PUBLIC_URL + "/invite#token=" + token,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Demo ready: 2 positions, 18 questions, 2 drives, 6 fictional scorecards, and a fresh candidate invitation."
            )
        )
        self.stdout.write(f"Private demo access details: {path.relative_to(settings.BASE_DIR)}")
