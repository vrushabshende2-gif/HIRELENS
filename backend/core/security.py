import hashlib
import hmac
import logging
from datetime import timedelta
from functools import wraps
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import APIException, PermissionDenied, Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler
from .models import AuditEvent, RateBucket

logger = logging.getLogger("hirelens")


class Conflict(APIException):
    status_code = 409
    default_detail = "This action is no longer available. Refresh and try again."


class Unavailable(APIException):
    status_code = 503
    default_detail = "This service is temporarily unavailable. Your work is safe."


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def private_hash(value):
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def audit(request, event, object_id=""):
    user = getattr(request, "user", None)
    AuditEvent.objects.create(
        actor_id=user.pk if user and user.is_authenticated else None,
        event=event,
        object_id=str(object_id),
        network_hash=private_hash(request.META.get("REMOTE_ADDR", "unknown")),
    )


def limit(key, maximum, seconds):
    now = timezone.now()
    with transaction.atomic():
        bucket, _ = RateBucket.objects.select_for_update().get_or_create(
            key=key, defaults={"expires_at": now + timedelta(seconds=seconds)}
        )
        if bucket.expires_at <= now:
            bucket.count = 0
            bucket.expires_at = now + timedelta(seconds=seconds)
        if bucket.count >= maximum:
            raise Throttled(wait=max(1, int((bucket.expires_at - now).total_seconds())))
        bucket.count += 1
        bucket.save()


def request_limit(request, scope, maximum=30, seconds=60):
    identity = (
        str(request.user.pk)
        if request.user.is_authenticated
        else request.META.get("REMOTE_ADDR", "unknown")
    )
    limit(f"{scope}:{private_hash(identity)}", maximum, seconds)


def endpoint(methods, public=False, recruiter=False):
    def decorate(fn):
        @api_view(methods)
        @permission_classes([AllowAny if public else IsAuthenticated])
        @wraps(fn)
        def wrapped(request, *args, **kwargs):
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                SessionAuthentication().enforce_csrf(request)
            request_limit(request, "api", 300)
            if recruiter and (request.user.role != "recruiter" or not request.user.verified):
                raise PermissionDenied("A verified recruiter account is required.")
            return fn(request, *args, **kwargs)

        return wrapped

    return decorate


def exception_handler(exc, context):
    response = drf_handler(exc, context)
    if response is None:
        logger.error("request_failed exception_type=%s", type(exc).__name__)
        return Response(
            {
                "detail": "Something went wrong. Please try again.",
                "code": "internal_error",
            },
            status=500,
        )
    return response


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-Frame-Options"] = "DENY"
        response["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
        response["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' wss://generativelanguage.googleapis.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
        if request.path.startswith("/api/"):
            response["Cache-Control"] = "no-store"
        return response
