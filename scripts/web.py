import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.config.settings")
from backend.config.wsgi import application
from waitress import serve

options = {}
if os.getenv("RENDER"):
    options = {
        "trusted_proxy": "*",
        "trusted_proxy_count": 1,
        "trusted_proxy_headers": "x-forwarded-for x-forwarded-proto",
    }
serve(
    application,
    host=sys.argv[1],
    port=int(sys.argv[2]),
    threads=4,
    max_request_body_size=262144,
    **options,
)
