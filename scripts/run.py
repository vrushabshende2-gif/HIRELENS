"""Supervise the web process and durable worker in one small deployment instance."""

import os
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
os.chdir(root)
sys.path.insert(0, str(root))
from dotenv import load_dotenv

load_dotenv(root / ".env", encoding="utf-8-sig")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.config.settings")


def main():
    port = os.getenv("PORT", "8000")
    host = os.getenv("HOST", "127.0.0.1")
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    children = []
    try:
        children.append(
            subprocess.Popen([sys.executable, "manage.py", "worker"], cwd=root, creationflags=flags)
        )
        children.append(
            subprocess.Popen(
                [sys.executable, "scripts/web.py", host, port],
                cwd=root,
                creationflags=flags,
            )
        )
        print(f"HireLens ready at http://{host}:{port}", flush=True)
        while True:
            for process in children:
                if process.poll() is not None:
                    raise RuntimeError(
                        "A HireLens service stopped; the supervisor is shutting down."
                    )
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for process in children:
            process.terminate()
        for process in children:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
