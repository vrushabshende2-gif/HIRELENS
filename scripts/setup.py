"""Run with the project's virtual-environment Python after installing requirements."""

import os
import secrets
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
os.chdir(root)
env = root / ".env"
if not env.exists():
    env.write_text(
        (root / ".env.example")
        .read_text()
        .replace(
            "replace-with-a-random-secret-at-least-50-characters",
            secrets.token_urlsafe(48),
        ),
        encoding="utf-8",
    )
for args in [
    ["manage.py", "migrate"],
    ["manage.py", "seed_demo"],
    ["manage.py", "seed_question_catalog"],
    ["manage.py", "collectstatic", "--noinput"],
]:
    subprocess.run([sys.executable, *args], check=True)
print("Setup complete. Add GEMINI_API_KEY to .env, then run: python scripts/run.py")
