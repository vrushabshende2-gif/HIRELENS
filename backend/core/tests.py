import os
import secrets
import uuid
from datetime import timedelta
from unittest.mock import patch
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from evaluation.adaptive import update, prior, mean, select_question
from evaluation.gemini import Grade, ConceptGrade, ProviderError, grade_answer
from evaluation.scoring import code_structure, evaluate
from .models import (
    User,
    Organization,
    Position,
    Question,
    Drive,
    Invitation,
    Interview,
    Evaluation,
    Job,
    WorkerStatus,
)
from .views import snapshot
from .security import digest
from .jobs import run_one, expire_answers
from .mailer import send_email
from .reporting import csv_response, build_report
from .demo_questions import QUESTIONS


@override_settings(
    SECURE_SSL_REDIRECT=False,
    ALLOWED_HOSTS=["testserver", "localhost"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class HireLensTests(TestCase):
    def test_numeric_inputs_reject_nonfinite_values(self):
        from .serializers import SkillInput, InviteInput

        for value in ["NaN", "Infinity", "-Infinity"]:
            self.assertFalse(SkillInput(data={"topic": "Databases", "weight": value}).is_valid())
            self.assertFalse(
                InviteInput(
                    data={
                        "name": "Example",
                        "email": "one@example.com",
                        "accommodation_multiplier": value,
                    }
                ).is_valid()
            )

    def test_embeddings_use_model_specific_payloads_and_cache(self):
        from evaluation.gemini import semantic_similarity

        for model in ["gemini-embedding-001", "gemini-embedding-2"]:
            with patch.dict(os.environ, {"GEMINI_EMBEDDING_MODEL": model}):
                with patch(
                    "evaluation.gemini.call",
                    return_value={"embedding": {"values": [1.0] + [0.0] * 767}},
                ) as provider:
                    self.assertEqual(
                        semantic_similarity("Equivalent explanation", "Reference explanation"), 1
                    )
                    self.assertEqual(provider.call_count, 2)
                    payload = provider.call_args.args[2]
                    self.assertEqual("taskType" in payload, model == "gemini-embedding-001")
                    if model == "gemini-embedding-2":
                        self.assertTrue(
                            payload["content"]["parts"][0]["text"].startswith(
                                "task: sentence similarity | query: "
                            )
                        )
                    provider.reset_mock()
                    semantic_similarity("Equivalent explanation", "Reference explanation")
                    provider.assert_not_called()

    def test_invalid_code_cannot_receive_high_technical_accuracy(self):
        from types import SimpleNamespace

        question = next(q for q in QUESTIONS if q["kind"] == "code")
        grade = SimpleNamespace(
            concepts=[
                SimpleNamespace(
                    index=i,
                    coverage=1,
                    contradiction=False,
                    quote="function",
                    explanation="Evidence",
                )
                for i, _ in enumerate(question["concepts"])
            ],
            reasoning=4,
            communication=4,
            uncertainty=False,
            feedback="Invalid syntax",
        )
        with (
            patch("evaluation.scoring.semantic_similarity", return_value=1),
            patch("evaluation.scoring.grade_answer", return_value=grade),
        ):
            result = evaluate(question, "function invalid( {", 10)
        self.assertLessEqual(result["technical"], 40)
        self.assertIn("syntax_error", result["flags"])

    @classmethod
    def setUpTestData(cls):
        cls.password = "Tests-Only-Strong!947"
        cls.recruiter = User.objects.create_user(
            username="recruiter",
            email="recruiter@test.example",
            password=cls.password,
            role="recruiter",
            verified=True,
        )
        cls.other = User.objects.create_user(
            username="other",
            email="other@test.example",
            password=cls.password,
            role="recruiter",
            verified=True,
        )
        cls.candidate = User.objects.create_user(
            username="candidate",
            email="candidate@test.example",
            password=cls.password,
            role="candidate",
            verified=True,
        )
        cls.org = Organization.objects.create(owner=cls.recruiter, name="One")
        cls.other_org = Organization.objects.create(owner=cls.other, name="Two")
        cls.position = Position.objects.create(
            organization=cls.org,
            title="Engineer",
            skills=[{"topic": "JavaScript", "weight": 1, "minimum": 40}],
        )
        cls.questions = [Question.objects.create(organization=cls.org, **q) for q in QUESTIONS[:6]]
        cls.drive = Drive.objects.create(
            organization=cls.org,
            position=cls.position,
            name="Test drive",
            status="active",
            expires_at=timezone.now() + timedelta(days=1),
            question_count=3,
            duration_minutes=10,
            question_pool=[snapshot(q) for q in cls.questions],
            policy={"title": "Engineer", "skills": cls.position.skills},
        )

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.get("/api/auth/session/")
        self.client.credentials(HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)

    def login(self, user):
        self.client.force_login(user)
        self.client.get("/api/auth/session/")
        self.client.credentials(HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)

    def post(self, url, data=None, method="post"):
        return getattr(self.client, method)(url, data or {}, format="json")

    def invite(self, email=None):
        token = secrets.token_urlsafe(32)
        invite = Invitation.objects.create(
            drive=self.drive,
            name="Candidate",
            email=email or self.candidate.email,
            expires_at=self.drive.expires_at,
            token_hash=digest(token),
        )
        return invite, token

    def start(self):
        self.login(self.candidate)
        invite, token = self.invite()
        self.tab = uuid.uuid4()
        WorkerStatus.objects.create(name="primary")
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-not-a-real-api-key"}):
            response = self.post(
                "/api/interviews/start/",
                {
                    "token": token,
                    "tab_id": str(self.tab),
                    "consent": True,
                    "demo_acknowledged": True,
                },
            )
        self.assertEqual(response.status_code, 201, response.data)
        return Interview.objects.get(pk=response.data["id"])

    def submission(self, interview, answer="A clear answer", submission_id=None):
        attempt = interview.attempts.latest("ordinal")
        identifier = submission_id or uuid.uuid4()
        response = self.post(
            f"/api/interviews/{interview.pk}/answer/",
            {
                "attempt_id": str(attempt.pk),
                "answer": answer,
                "tab_id": str(self.tab),
                "submission_id": str(identifier),
            },
        )
        return response, attempt, identifier

    def test_login_requires_csrf_and_password_is_argon2(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.post(
            "/api/auth/login/",
            {"email": self.recruiter.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(self.recruiter.password.startswith("argon2$"))
        response = self.post(
            "/api/auth/login/",
            {"email": self.recruiter.email, "password": self.password},
        )
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_X_CSRFTOKEN=response.data["csrf_token"])
        session_key = self.client.session.session_key
        self.assertEqual(self.post("/api/auth/logout/").status_code, 200)
        from django.contrib.sessions.models import Session

        self.assertFalse(Session.objects.filter(session_key=session_key).exists())

    def test_signup_verification_and_reset_tokens_single_use(self):
        response = self.post(
            "/api/auth/signup/",
            {
                "email": "New@Test.Example",
                "name": "New Person",
                "password": self.password,
                "role": "candidate",
            },
        )
        self.assertEqual(response.status_code, 202, response.data)
        user = User.objects.get(email="new@test.example")
        self.assertFalse(user.verified)
        job = Job.objects.get(kind="email")
        token = job.payload["body"].split("#token=")[1].split("\n")[0]
        self.assertEqual(self.post("/api/auth/verify/", {"token": token}).status_code, 200)
        self.assertEqual(self.post("/api/auth/verify/", {"token": token}).status_code, 400)
        user.refresh_from_db()
        self.assertTrue(user.verified)
        self.assertEqual(self.post("/api/auth/forgot/", {"email": user.email}).status_code, 202)
        job = Job.objects.filter(kind="email").latest("created_at")
        reset_token = job.payload["body"].split("#token=")[1].split("\n")[0]
        old_hash = user.get_session_auth_hash()
        self.assertEqual(
            self.post(
                "/api/auth/reset/",
                {"token": reset_token, "password": "A-different-test!123"},
            ).status_code,
            200,
        )
        user.refresh_from_db()
        self.assertNotEqual(old_hash, user.get_session_auth_hash())
        self.assertEqual(
            self.post(
                "/api/auth/reset/", {"token": reset_token, "password": self.password}
            ).status_code,
            400,
        )

    def test_auth_responses_do_not_enumerate_accounts(self):
        for email in [self.candidate.email, "missing@test.example"]:
            response = self.post("/api/auth/forgot/", {"email": email})
            self.assertEqual(response.status_code, 202)
            self.assertEqual(
                response.data["detail"],
                "If the account is eligible, an email will arrive shortly.",
            )

    def test_candidate_cannot_read_recruiter_resources(self):
        self.login(self.candidate)
        for path in [
            "/api/questions/",
            "/api/positions/",
            "/api/overview/",
            "/api/candidates/",
            "/api/analytics/",
        ]:
            self.assertEqual(self.client.get(path).status_code, 403, path)

    def test_question_bank_is_bounded_and_paginated(self):
        self.login(self.recruiter)
        response = self.client.get("/api/questions/?limit=2&offset=0")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(response.data["count"], len(self.questions))
        self.assertEqual(response.data["next_offset"], 2)

    def test_catalog_can_be_initialized_without_a_server_shell(self):
        self.login(self.recruiter)
        status = self.client.get("/api/questions/catalog/")
        self.assertEqual(status.status_code, 200)
        self.assertFalse(status.data["complete"])
        seeded = self.post("/api/questions/catalog/")
        self.assertEqual(seeded.status_code, 200, seeded.data)
        self.assertGreater(seeded.data["created"], 0)
        self.assertLessEqual(seeded.data["created"], 600)
        self.assertEqual(
            Question.objects.filter(organization=self.org, catalog_key__startswith="catalog-v1:").count(),
            seeded.data["created"],
        )
        self.login(self.other)
        other_status = self.client.get("/api/questions/catalog/")
        self.assertEqual(other_status.status_code, 200)
        self.assertEqual(other_status.data["total"], 0)

    def test_cross_organization_resource_access(self):
        self.login(self.other)
        self.assertEqual(self.client.get("/api/positions/").data, [])
        self.assertEqual(
            self.post(
                f"/api/positions/{self.position.pk}/", {"title": "Stolen"}, "patch"
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get(f"/api/drives/{self.drive.pk}/").status_code, 404)
        self.assertEqual(
            self.post(
                f"/api/drives/{self.drive.pk}/invite/",
                {"email": "x@y.example", "name": "X"},
            ).status_code,
            404,
        )

    def test_drive_freezes_question_versions(self):
        self.login(self.recruiter)
        draft = Drive.objects.create(
            organization=self.org,
            position=self.position,
            name="Draft",
            expires_at=self.drive.expires_at,
            question_count=3,
        )
        self.assertEqual(self.post(f"/api/drives/{draft.pk}/publish/").status_code, 200)
        draft.refresh_from_db()
        old = draft.question_pool[0]["prompt"]
        question = Question.objects.get(pk=draft.question_pool[0]["id"])
        self.assertEqual(
            self.post(
                f"/api/questions/{question.pk}/", {"prompt": "Changed later"}, "patch"
            ).status_code,
            200,
        )
        draft.refresh_from_db()
        self.assertEqual(draft.question_pool[0]["prompt"], old)
        question.refresh_from_db()
        self.assertEqual(question.version, 2)
        self.assertEqual(
            self.post(f"/api/drives/{draft.pk}/", {"question_count": 4}, "patch").status_code,
            409,
        )

    def test_invitation_wrong_email_expiry_and_missing_provider(self):
        self.login(self.candidate)
        invite, token = self.invite("different@test.example")
        payload = {
            "token": token,
            "tab_id": str(uuid.uuid4()),
            "consent": True,
            "demo_acknowledged": True,
        }
        self.assertEqual(self.post("/api/interviews/start/", payload).status_code, 403)
        invite.email = self.candidate.email
        invite.save()
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            self.assertEqual(self.post("/api/interviews/start/", payload).status_code, 503)
        invite.refresh_from_db()
        self.assertIsNone(invite.redeemed_at)
        invite.expires_at = timezone.now() - timedelta(seconds=1)
        invite.save()
        self.assertEqual(self.post("/api/invite/preview/", {"token": token}).status_code, 409)

    def test_live_token_is_constrained_to_the_active_candidate_turn(self):
        from types import SimpleNamespace

        interview = self.start()
        provider_response = SimpleNamespace(
            status_code=200,
            json=lambda: {"name": "auth_tokens/abcdefghijklmnopqrstuvwxyz123456"},
        )
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-not-a-real-api-key"}),
            patch("evaluation.gemini.httpx.post", return_value=provider_response) as provider,
        ):
            response = self.post(
                f"/api/interviews/{interview.pk}/live-token/", {"tab_id": str(self.tab)}
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["attempt_id"], str(interview.attempts.first().pk))
        self.assertNotIn("GEMINI_API_KEY", str(response.data))
        payload = provider.call_args.kwargs["json"]
        self.assertEqual(payload["uses"], 1)
        self.assertEqual(
            payload["bidiGenerateContentSetup"]["generationConfig"]["responseModalities"],
            ["AUDIO"],
        )
        self.assertTrue(
            payload["bidiGenerateContentSetup"]["realtimeInputConfig"][
                "automaticActivityDetection"
            ]["disabled"]
        )
        self.assertIn(
            interview.attempts.first().question["prompt"],
            payload["bidiGenerateContentSetup"]["systemInstruction"]["parts"][0]["text"],
        )
        headers = self.client.get("/api/interviews/").headers
        self.assertIn("camera=(self)", headers["Permissions-Policy"])
        self.assertIn("wss://generativelanguage.googleapis.com", headers["Content-Security-Policy"])

    def test_submission_idempotency_no_score_leak_and_tab_integrity(self):
        interview = self.start()
        first = interview.attempts.first()
        self.assertEqual(first.question["difficulty"], 0)
        payload = self.client.get(f"/api/interviews/{interview.pk}/").data
        self.assertNotIn("expected_answer", str(payload))
        self.assertNotIn("concepts", str(payload))
        response, attempt, identifier = self.submission(interview)
        self.assertEqual(response.status_code, 202, response.data)
        response, _, _ = self.submission(interview, submission_id=identifier)
        self.assertEqual(response.status_code, 202)
        self.assertEqual(Job.objects.filter(kind="evaluate").count(), 1)
        response, _, _ = self.submission(interview)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            self.post(
                f"/api/interviews/{interview.pk}/heartbeat/",
                {"tab_id": str(uuid.uuid4())},
            ).status_code,
            409,
        )

    def test_worker_advances_once_and_reports_after_last_answer(self):
        interview = self.start()
        result = {
            "score": 90,
            "technical": 92,
            "reasoning": 85,
            "communication": 90,
            "efficiency": 85,
            "semantic": 90,
            "coverage": 90,
            "code_structure": None,
            "evidence": [],
            "feedback": "Supported assessment.",
            "confidence": "medium",
            "flags": [],
        }
        with patch("backend.core.jobs.evaluate", return_value=result):
            for i in range(3):
                response, attempt, _ = self.submission(interview)
                self.assertEqual(response.status_code, 202)
                run_one()
                interview.refresh_from_db()
        self.assertEqual(interview.status, "completed")
        self.assertEqual(interview.attempts.count(), 3)
        self.assertEqual(Evaluation.objects.count(), 3)
        self.assertEqual(Job.objects.filter(kind="report").count(), 1)
        report, _ = build_report(interview)
        self.assertGreaterEqual(report.overall, 0)
        self.assertLessEqual(report.overall, 100)
        self.login(self.other)
        self.assertEqual(self.client.get(f"/api/reports/{report.pk}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/reports/{report.pk}/export/pdf/").status_code, 404)
        self.login(self.candidate)
        self.assertEqual(self.client.get(f"/api/reports/{report.pk}/").status_code, 403)
        self.login(self.recruiter)
        response = self.client.get(f"/api/reports/{report.pk}/export/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_expiry_submits_last_saved_answer(self):
        interview = self.start()
        attempt = interview.attempts.first()
        attempt.draft = "Previously saved answer"
        attempt.issued_at = timezone.now() - timedelta(minutes=11)
        attempt.save()
        expire_answers()
        attempt.refresh_from_db()
        interview.refresh_from_db()
        self.assertEqual(attempt.answer, "Previously saved answer")
        self.assertEqual(attempt.elapsed_seconds, 600)
        self.assertEqual(interview.answering_seconds, 600)

    def test_provider_failure_preserves_submission(self):
        interview = self.start()
        self.submission(interview, "An answer that must not be lost")
        with patch(
            "backend.core.jobs.evaluate",
            side_effect=ProviderError("ai_rate_limited", 60),
        ):
            run_one()
        self.assertEqual(interview.attempts.first().answer, "An answer that must not be lost")
        self.assertEqual(interview.attempts.count(), 1)
        self.assertEqual(Job.objects.get(kind="evaluate").state, "pending")
        self.assertFalse(Evaluation.objects.exists())

    def test_scoring_rejects_fabricated_quotes(self):
        result = Grade(
            concepts=[
                ConceptGrade(
                    index=i,
                    coverage=1,
                    quote="Never said this",
                    explanation="x",
                    contradiction=False,
                )
                for i in range(3)
            ],
            reasoning=4,
            reasoning_quote="Never said this",
            communication=4,
            feedback="x",
            uncertainty=False,
        )
        with patch("evaluation.gemini.generate", return_value=result):
            with self.assertRaises(ProviderError):
                grade_answer(snapshot(self.questions[0]), "Actual answer")

    def test_adaptation_updates_and_no_repeated_questions(self):
        self.assertGreater(mean(update(prior(), 1, 0)), mean(prior()))
        self.assertLess(mean(update(prior(), 0, 0)), mean(prior()))
        interview = self.start()
        first = interview.attempts.first()
        selected = select_question(
            self.drive.question_pool,
            [first],
            self.position.skills,
            {},
            str(interview.pk),
        )
        self.assertNotEqual(selected["id"], first.question["id"])

    def test_code_checks_parse_without_execution(self):
        checks = [{"kind": "function"}, {"kind": "return"}]
        score, flags = code_structure("function plus(a,b) { return a+b; }", "javascript", checks)
        self.assertEqual(score, 1)
        self.assertIn("static_analysis_only", flags)
        self.assertEqual(code_structure("function broken( {", "javascript", checks)[0], 0)
        self.assertEqual(code_structure("def f(x):\n    return x + 1", "python", checks)[0], 1)
        self.assertEqual(code_structure("def f( nope", "python", checks)[0], 0)

    def test_csv_formula_injection_and_empty_answer(self):
        response = csv_response([['=HYPERLINK("bad")', "normal", "+SUM(1,2)"]], "test.csv")
        text = response.content.decode("utf-8-sig")
        self.assertIn("'=HYPERLINK", text)
        self.assertIn("'+SUM", text)
        self.assertEqual(evaluate(snapshot(self.questions[0]), "", 10)["score"], 0)

    def test_auth_rate_limit_is_persistent(self):
        for i in range(12):
            response = self.post(
                "/api/auth/login/",
                {"email": "missing@test.example", "password": "wrong"},
            )
            self.assertEqual(response.status_code, 400)
        self.assertEqual(
            self.post(
                "/api/auth/login/",
                {"email": "missing@test.example", "password": "wrong"},
            ).status_code,
            429,
        )

    def test_local_transactional_email_has_plain_and_html_versions(self):
        with override_settings(DEBUG=True), patch.dict(os.environ, {"RESEND_API_KEY": ""}):
            send_email(
                {
                    "recipient": "candidate@test.example",
                    "subject": "Verify your HireLens email",
                    "body": "Use this link:\nhttp://localhost:8000/verify-email#token=abc",
                },
                "test-local-mail",
            )
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["candidate@test.example"])
        self.assertIn("verify-email#token=abc", message.body)
        self.assertEqual(message.alternatives[0][1], "text/html")
        self.assertIn("Verify email", message.alternatives[0][0])
