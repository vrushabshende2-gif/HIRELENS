"""Short-lived, interview-scoped WebRTC tokens for live monitoring."""

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

from .models import OrganizationMembership


def livekit_configured():
    return all(
        os.getenv(key, "").strip()
        for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")
    )


def _b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def issue_token(interview, user, role, allow_screen=False):
    """Create a LiveKit-compatible HS256 JWT without exposing the API secret."""
    if not livekit_configured():
        raise RuntimeError("Live monitoring is not configured.")
    now = int(time.time())
    room = f"hirelens-{interview.pk.hex}"
    candidate = role == "candidate"
    identity = (
        f"candidate-{interview.candidate_id}"
        if candidate
        else f"recruiter-{user.pk}-{uuid.uuid4().hex[:12]}"
    )
    video = {
        "roomJoin": True,
        "room": room,
        "canPublish": candidate,
        "canSubscribe": not candidate,
        "canPublishData": False,
    }
    if candidate:
        # The browser can publish only user-selected camera/screen video. It
        # never publishes microphone audio to LiveKit; audio remains on the
        # existing Gemini interview path.
        video["canPublishSources"] = ["camera"] + (["screen_share"] if allow_screen else [])
    claims = {
        "iss": os.environ["LIVEKIT_API_KEY"],
        "sub": identity,
        "name": "Candidate" if candidate else "Authorized recruiter",
        "nbf": now - 5,
        "iat": now,
        "exp": now + 600,
        "video": video,
    }
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64(json.dumps(claims, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = hmac.new(
        os.environ["LIVEKIT_API_SECRET"].encode(), signing_input, hashlib.sha256
    ).digest()
    return f"{header}.{payload}.{_b64(signature)}", room


def recruiter_can_monitor(user, drive):
    if user.role != "recruiter" or not user.verified:
        return False
    if drive.organization.owner_id == user.pk:
        return True
    return OrganizationMembership.objects.filter(
        organization=drive.organization,
        user=user,
        role__in=("admin", "recruiter"),
    ).exists()
