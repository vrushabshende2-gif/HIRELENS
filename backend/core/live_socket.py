"""Authenticated same-origin relay for Gemini Live sessions."""

import asyncio
import json
import logging
import uuid
from http.cookies import SimpleCookie
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore
from django.utils.crypto import constant_time_compare
from rest_framework.exceptions import Throttled
from websockets.asyncio.client import connect

from evaluation.gemini import ProviderError, create_live_token, live_model

from .models import Interview
from .security import digest, limit

logger = logging.getLogger("hirelens.live")


def _origin_allowed(scope):
    origin = next(
        (value.decode("latin1") for key, value in scope.get("headers", []) if key == b"origin"),
        "",
    )
    if not origin:
        return False
    expected = {settings.PUBLIC_URL.rstrip("/")}
    if settings.DEBUG:
        # Vite serves the local UI on 5173 and proxies /api WebSockets to Django.
        expected.update(
            {
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:8000",
                "http://127.0.0.1:8000",
            }
        )
    return origin in expected


def _session_user(scope):
    cookie_header = next(
        (value.decode("latin1") for key, value in scope.get("headers", []) if key == b"cookie"),
        "",
    )
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header)
    except Exception:
        return None
    morsel = cookie.get(settings.SESSION_COOKIE_NAME)
    if not morsel:
        return None
    try:
        session = SessionStore(session_key=morsel.value).load()
    except Exception:
        return None
    user_id = session.get("_auth_user_id")
    if not user_id:
        return None
    user = get_user_model().objects.filter(pk=user_id).first()
    session_hash = session.get("_auth_user_hash", "")
    if (
        not user
        or not user.is_active
        or not session_hash
        or not constant_time_compare(user.get_session_auth_hash(), session_hash)
    ):
        return None
    return user


def _authorized_attempt(interview_id, tab_id, user):
    if user.role != "candidate" or not user.verified:
        return None, "candidate_required"
    interview = (
        Interview.objects.filter(pk=interview_id, candidate=user)
        .select_related("invitation__drive")
        .first()
    )
    if not interview or interview.status != "in_progress":
        return None, "interview_unavailable"
    if str(interview.active_tab) != str(tab_id):
        return None, "interview_tab_conflict"
    attempt = interview.attempts.order_by("-ordinal").first()
    if not attempt or attempt.submitted_at:
        return None, "question_unavailable"
    return attempt, ""


async def _send_error(send, code, detail, close_code=1011):
    await send(
        {
            "type": "websocket.send",
            "text": json.dumps({"error": {"code": code, "message": detail}}),
        }
    )
    await send({"type": "websocket.close", "code": close_code})


async def live_socket(scope, receive, send, interview_id):
    if not _origin_allowed(scope):
        await send({"type": "websocket.close", "code": 4403})
        return
    await send({"type": "websocket.accept"})

    user = await sync_to_async(_session_user, thread_sensitive=True)(scope)
    if not user:
        await _send_error(send, "session_expired", "Sign in again to join this interview.", 4401)
        return

    query = parse_qs(scope.get("query_string", b"").decode("ascii", "ignore"))
    try:
        tab_id = uuid.UUID(query.get("tab_id", [""])[0])
        attempt_id = uuid.UUID(query.get("attempt_id", [""])[0])
    except (ValueError, TypeError):
        await _send_error(send, "invalid_session", "Reload the interview and try again.", 4400)
        return

    attempt, auth_error = await sync_to_async(
        _authorized_attempt, thread_sensitive=True
    )(interview_id, tab_id, user)
    if auth_error:
        messages = {
            "candidate_required": "Sign in with the verified candidate account for this invitation.",
            "interview_unavailable": "This interview is no longer active. Refresh the page to continue.",
            "interview_tab_conflict": "This interview is active in another tab. Return to that tab or take over the session.",
            "question_unavailable": "There is no unanswered question to join. Refresh the interview.",
        }
        await _send_error(send, auth_error, messages[auth_error], 4403)
        return
    if attempt.pk != attempt_id:
        await _send_error(
            send,
            "question_changed",
            "The active question changed. Refresh the interview before joining.",
            4409,
        )
        return

    try:
        await sync_to_async(limit, thread_sensitive=True)(
            f"live_relay:{digest(str(user.pk))}", 24, 600
        )
        issued = await sync_to_async(create_live_token, thread_sensitive=True)(attempt.question)
    except Throttled:
        await _send_error(
            send,
            "live_rate_limited",
            "Too many live connection retries. Wait a minute, then reconnect.",
            4429,
        )
        return
    except ProviderError as exc:
        messages = {
            "ai_rate_limited": "Gemini is temporarily rate-limited. Wait about a minute, then retry.",
            "ai_quota_wait": "Gemini is temporarily rate-limited. Wait about a minute, then retry.",
            "ai_configuration_error": "Gemini rejected the configured key or live model. Check GEMINI_API_KEY and GEMINI_LIVE_MODEL in Render.",
            "ai_not_configured": "Gemini is not configured on the server. Add GEMINI_API_KEY in Render.",
        }
        await _send_error(
            send,
            exc.code,
            messages.get(exc.code, "Gemini could not start the live interview. Retry in a moment."),
        )
        return

    uri = (
        "wss://generativelanguage.googleapis.com/ws/"
        "google.ai.generativelanguage.v1beta.GenerativeService."
        f"BidiGenerateContentConstrained?access_token={issued['token']}"
    )
    try:
        async with connect(uri, open_timeout=20, close_timeout=3, ping_interval=20, max_size=4 * 1024 * 1024) as gemini:
            setup_sent = False

            async def browser_to_gemini():
                nonlocal setup_sent
                while True:
                    event = await receive()
                    if event["type"] == "websocket.disconnect":
                        return
                    if event["type"] != "websocket.receive":
                        continue
                    data = event.get("text")
                    if data is None:
                        await _send_error(send, "invalid_message", "Only JSON interview messages are accepted.", 4400)
                        return
                    try:
                        message = json.loads(data)
                    except (TypeError, ValueError):
                        await _send_error(send, "invalid_message", "Interview messages must be valid JSON.", 4400)
                        return
                    if not setup_sent:
                        if not isinstance(message, dict) or not isinstance(message.get("setup"), dict):
                            await _send_error(send, "setup_required", "The live session setup was missing. Retry live audio.", 4400)
                            return
                        # Keep model and transcript configuration under server
                        # control. The browser only signals that it is ready.
                        message["setup"] = {
                            "model": f"models/{live_model()}",
                            "generationConfig": {"responseModalities": ["AUDIO"]},
                            "inputAudioTranscription": {},
                            "outputAudioTranscription": {},
                            "realtimeInputConfig": {
                                "automaticActivityDetection": {"disabled": True}
                            },
                        }
                        setup_sent = True
                        data = json.dumps(message)
                    await gemini.send(data)

            async def gemini_to_browser():
                async for message in gemini:
                    if isinstance(message, bytes):
                        message = message.decode("utf-8", "replace")
                    await send({"type": "websocket.send", "text": message})

            client_task = asyncio.create_task(browser_to_gemini())
            provider_task = asyncio.create_task(gemini_to_browser())
            done, pending = await asyncio.wait(
                {client_task, provider_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                error = task.exception()
                if error:
                    raise error
            if provider_task in done:
                await send({"type": "websocket.close", "code": 1011})
    except Exception as exc:
        # Never pass upstream exception text or token-bearing URLs to a client.
        logger.warning("live_upstream_failed exception_type=%s", type(exc).__name__)
        await _send_error(
            send,
            "live_upstream_unavailable",
            "HireLens could not keep the Gemini connection open. Retry live audio; your answer and devices are safe.",
            1011,
        )
