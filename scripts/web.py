import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.config.settings")
from backend.config.asgi import application
import uvicorn

uvicorn.run(
    application,
    host=sys.argv[1],
    port=int(sys.argv[2]),
    ws="websockets",
    ws_max_size=262144,
    ws_max_queue=16,
    limit_concurrency=200,
    timeout_keep_alive=10,
    timeout_graceful_shutdown=10,
    proxy_headers=bool(os.getenv("RENDER")),
    forwarded_allow_ips="*" if os.getenv("RENDER") else "127.0.0.1",
    access_log=False,
)
