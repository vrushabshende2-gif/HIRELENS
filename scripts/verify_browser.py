"""Full-stack browser test with only the external Gemini HTTP boundary mocked.

Uses an isolated database and fictional accounts. No production inference fallback
is installed, and no traffic is sent to Google by this verification process.
"""

import json
import os
import secrets
import subprocess
import sys
import threading
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)
RUN = ARTIFACTS / ("browser-" + secrets.token_hex(4))
RUN.mkdir()
os.environ.update(
    {
        "DATABASE_URL": "sqlite:///" + str(RUN / "test.sqlite3").replace("\\", "/"),
        "DEBUG": "true",
        "SECRET_KEY": secrets.token_urlsafe(48),
        "PUBLIC_URL": "http://127.0.0.1:8001",
        "ALLOWED_HOSTS": "localhost,127.0.0.1",
        "GEMINI_API_KEY": "test-boundary-only",
        "RESEND_API_KEY": "",
        "AI_DATA_POLICY": "demo_only",
        "DJANGO_SETTINGS_MODULE": "backend.config.settings",
    }
)
import django

django.setup()
from django.core.management import call_command
from django.db import close_old_connections, connections
from django.utils import timezone
from backend.core.jobs import run_one, expire_answers
from backend.core.models import Report, WorkerStatus
from backend.config.wsgi import application
from waitress import create_server


def fake_provider(model, operation, payload):
    """Fixtures represent a reliable external API response, never actual model quality."""
    if operation == "embedContent":
        return {"embedding": {"values": [1.0] + [0.0] * 767}}
    content = json.loads(payload["contents"][0]["parts"][0]["text"])
    if "candidate_answer" in content:
        quote = content["candidate_answer"][:180]
        result = {
            "concepts": [
                {
                    "index": i,
                    "coverage": 1,
                    "quote": quote,
                    "explanation": "Controlled browser-test evidence.",
                    "contradiction": False,
                }
                for i, _ in enumerate(content["question"]["concepts"])
            ],
            "reasoning": 4,
            "reasoning_quote": quote,
            "communication": 4,
            "feedback": "Controlled test response; this verifies application behavior, not model quality.",
            "uncertainty": False,
        }
    else:
        source = content["transcript"][0]
        result = {
            "strengths": [
                {
                    "attempt_id": source["attempt_id"],
                    "quote": source["answer"][:100],
                    "observation": "Controlled evidence citation for browser verification.",
                }
            ],
            "weaknesses": [],
            "summary": "A complete interview traversed the API, database, adaptive engine, and validated report pipeline using a mocked external provider.",
        }
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(result)}]}}]}


def main():
    call_command("migrate", verbosity=0)
    access = RUN / "access.json"
    call_command("seed_demo", access_file=str(access.relative_to(ROOT)), verbosity=0)
    WorkerStatus.objects.update_or_create(name="primary", defaults={"seen_at": timezone.now()})
    server = create_server(application, host="127.0.0.1", port=8001, threads=4)
    stop = threading.Event()

    def worker():
        while not stop.is_set():
            close_old_connections()
            try:
                expire_answers()
                run_one()
            except Exception as exc:
                print("Test worker:", type(exc).__name__, flush=True)
            stop.wait(0.25)
        connections.close_all()

    with patch("evaluation.gemini.call", side_effect=fake_provider):
        web_thread = threading.Thread(target=server.run, daemon=True)
        worker_thread = threading.Thread(target=worker, daemon=True)
        web_thread.start()
        worker_thread.start()
        try:
            env = {
                **os.environ,
                "HIRELENS_TEST_URL": "http://127.0.0.1:8001",
                "HIRELENS_ACCESS_FILE": str(access),
                "HIRELENS_ARTIFACT_DIR": str(RUN),
                "HIRELENS_LIVE_TEST_MODE": "fallback",
            }
            result = subprocess.run(["node", "tests/browser.mjs"], cwd=ROOT / "frontend", env=env)
            if result.returncode:
                raise SystemExit(result.returncode)
            report = Report.objects.filter(
                source="gemini", interview__candidate__email="candidate@example.com"
            ).get()
            assert report.narrative_status == "complete"
            assert report.interview.attempts.count() == 12
            assert all(
                a.evaluation.model == "gemini-2.5-flash-lite"
                for a in report.interview.attempts.all()
            )
            print(
                "Full-stack browser check passed: 12 questions, durable evaluations, grounded report, and exports.",
                flush=True,
            )
            print("Artifacts:", RUN.relative_to(ROOT), flush=True)
        finally:
            stop.set()
            worker_thread.join(timeout=5)
            server.close()
            connections.close_all()


if __name__ == "__main__":
    main()
