"""Start a single-instance deployment after validating durable storage and HTTPS."""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.config.settings")
from backend.config import settings

if settings.DEBUG:
    raise RuntimeError("Deployment requires DEBUG=false.")
if not os.getenv("RESEND_API_KEY"):
    raise RuntimeError(
        "Set RESEND_API_KEY and a verified EMAIL_FROM before deploying account verification."
    )
for args in [("check",), ("migrate", "--noinput"), ("collectstatic", "--noinput")]:
    subprocess.run([sys.executable, "manage.py", *args], check=True)
from scripts.run import main

main()
