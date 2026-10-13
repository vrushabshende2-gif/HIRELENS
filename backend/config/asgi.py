"""Django HTTP application with an authenticated same-origin Live API relay."""

import os
import re
import uuid

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.config.settings")

from django.core.asgi import get_asgi_application

django_application = get_asgi_application()


async def application(scope, receive, send):
    if scope["type"] == "lifespan":
        while True:
            event = await receive()
            if event["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif event["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return
    if scope["type"] == "websocket":
        match = re.fullmatch(r"/api/interviews/([0-9a-fA-F-]{36})/live/", scope.get("path", ""))
        if match:
            try:
                interview_id = uuid.UUID(match.group(1))
            except ValueError:
                await send({"type": "websocket.close", "code": 4400})
                return
            from backend.core.live_socket import live_socket

            await live_socket(scope, receive, send, interview_id)
            return
        await send({"type": "websocket.close", "code": 4404})
        return
    await django_application(scope, receive, send)
