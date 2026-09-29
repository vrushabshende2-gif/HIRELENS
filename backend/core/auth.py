import secrets
import base64
import hashlib
import hmac
import struct
import time
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import authenticate, login, logout, password_validation
from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .models import User, Organization, AuthToken, Job, PrivacyRequest
from .security import endpoint, request_limit, limit, digest, private_hash, audit
from .serializers import (
    validated,
    SignupInput,
    AuthInput,
    EmailInput,
    TokenInput,
    ResetInput,
    ProfileInput,
    PasswordChangeInput,
    MfaCodeInput,
    PrivacyRequestInput,
)


def user_data(user):
    result = {
        "id": str(user.id),
        "name": user.first_name,
        "email": user.email,
        "role": user.role,
        "verified": user.verified,
        "profile": {
            "name": user.first_name,
            "phone": user.phone,
            "timezone": user.timezone,
            "resume_url": user.resume_url,
            "portfolio_url": user.portfolio_url,
            "github_url": user.github_url,
            "linkedin_url": user.linkedin_url,
            "accommodation_preferences": user.accommodation_preferences,
            "notification_preferences": user.notification_preferences,
            "interview_consent": user.interview_consent,
            "transcript_retention_days": user.transcript_retention_days,
            "mfa_enabled": user.mfa_enabled,
        },
    }
    if user.role == "recruiter":
        org = Organization.objects.filter(owner=user).first()
        result["organization"] = org.name if org else ""
    return result


def queue_token(user, purpose):
    token = secrets.token_urlsafe(32)
    record = AuthToken.objects.create(
        user=user,
        purpose=purpose,
        digest=digest(token),
        expires_at=timezone.now() + timedelta(minutes=30 if purpose == "reset" else 1440),
    )
    path = "reset-password" if purpose == "reset" else "verify-email"
    Job.objects.create(
        kind="email",
        target_id=record.id,
        payload={
            "recipient": user.email,
            "subject": "Reset your HireLens password"
            if purpose == "reset"
            else "Verify your HireLens account",
            "body": f"Open this link to {'reset your password' if purpose == 'reset' else 'verify your email'}:\n\n{settings.PUBLIC_URL}/{path}#token={token}\n\nIf you did not request this, you can ignore it.",
        },
    )


def validate_password(value, user):
    try:
        password_validation.validate_password(value, user)
    except DjangoValidationError as exc:
        raise ValidationError({"password": exc.messages})


def totp_value(secret, counter):
    key = base64.b32decode(secret, casefold=True)
    digest_value = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest_value[-1] & 15
    number = struct.unpack(">I", digest_value[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{number % 1_000_000:06d}"


def valid_totp(secret, code):
    if not secret or not code:
        return False
    counter = int(time.time() // 30)
    return any(hmac.compare_digest(totp_value(secret, counter + delta), code) for delta in (-1, 0, 1))


@endpoint(["GET"], public=True)
def session(request):
    return Response(
        {
            "user": user_data(request.user) if request.user.is_authenticated else None,
            "csrf_token": get_token(request),
        }
    )


@endpoint(["POST"], public=True)
def signup(request):
    request_limit(request, "signup", 5, 3600)
    data = validated(SignupInput, request)
    email = data["email"].lower()
    user = User(
        username=secrets.token_hex(16),
        email=email,
        first_name=data["name"],
        role=data["role"],
    )
    validate_password(data["password"], user)
    user.set_password(data["password"])
    try:
        with transaction.atomic():
            user.save()
            if user.role == "recruiter":
                Organization.objects.create(owner=user, name=data["organization"])
            queue_token(user, "verify")
    except IntegrityError:
        pass
    audit(request, "signup_requested")
    return Response(
        {"detail": "If this email can be registered, a verification link will arrive shortly."},
        status=202,
    )


@endpoint(["POST"], public=True)
def signin(request):
    request_limit(request, "login", 12, 600)
    data = validated(AuthInput, request)
    email = data["email"].lower()
    limit(f"login_email:{private_hash(email)}", 12, 600)
    record = User.objects.filter(email__iexact=email).first()
    user = authenticate(
        request,
        username=record.username if record else "missing-" + secrets.token_hex(8),
        password=data["password"],
    )
    if not user or not user.verified:
        audit(request, "login_failed")
        return Response(
            {"detail": "Unable to sign in. Check your credentials and verify your email."},
            status=400,
        )
    if user.mfa_enabled and not valid_totp(user.mfa_secret, data.get("totp_code", "")):
        audit(request, "login_mfa_failed")
        return Response({"detail": "Unable to sign in. Check your credentials and verification code."}, status=400)
    login(request, user)
    audit(request, "login_succeeded")
    return Response({"user": user_data(user), "csrf_token": get_token(request)})


@endpoint(["POST"])
def signout(request):
    audit(request, "logout")
    logout(request)
    return Response({"detail": "Signed out.", "csrf_token": get_token(request)})


@endpoint(["GET", "PATCH"])
def profile(request):
    if request.method == "GET":
        return Response(user_data(request.user)["profile"])
    data = validated(ProfileInput, request)
    user = request.user
    if "name" in data:
        user.first_name = data.pop("name")
    for field, value in data.items():
        setattr(user, field, value)
    user.save(update_fields=["first_name", *data.keys()])
    audit(request, "profile_updated", user.pk)
    return Response(user_data(user)["profile"])


@endpoint(["POST"])
def change_password(request):
    data = validated(PasswordChangeInput, request)
    user = request.user
    if not user.check_password(data["current_password"]):
        raise ValidationError("Current password is incorrect.")
    validate_password(data["password"], user)
    user.set_password(data["password"])
    user.save(update_fields=["password"])
    current_key = request.session.session_key
    for session in Session.objects.all():
        if session.session_key == current_key:
            continue
        try:
            if session.get_decoded().get("_auth_user_id") == str(user.pk):
                session.delete()
        except Exception:
            session.delete()
    login(request, user)
    audit(request, "password_changed", user.pk)
    return Response({"detail": "Password updated. Other active sessions were signed out."})


@endpoint(["POST"])
def signout_all(request):
    user = request.user
    current_key = request.session.session_key
    for session in Session.objects.all():
        if session.session_key == current_key:
            continue
        try:
            if session.get_decoded().get("_auth_user_id") == str(user.pk):
                session.delete()
        except Exception:
            session.delete()
    audit(request, "sessions_revoked", user.pk)
    return Response({"detail": "Other active sessions were signed out."})


@endpoint(["POST"])
def mfa_setup(request):
    user = request.user
    secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
    recovery = [secrets.token_urlsafe(8) for _ in range(8)]
    user.mfa_secret = secret
    user.mfa_recovery_codes = recovery
    user.mfa_enabled = False
    user.save(update_fields=["mfa_secret", "mfa_recovery_codes", "mfa_enabled"])
    audit(request, "mfa_setup_started", user.pk)
    return Response({"secret": secret, "recovery_codes": recovery, "period_seconds": 30})


@endpoint(["POST"])
def mfa_enable(request):
    data = validated(MfaCodeInput, request)
    user = request.user
    if not valid_totp(user.mfa_secret, data["code"]):
        raise ValidationError("That verification code is invalid or expired.")
    user.mfa_enabled = True
    user.save(update_fields=["mfa_enabled"])
    audit(request, "mfa_enabled", user.pk)
    return Response({"enabled": True})


@endpoint(["POST"])
def mfa_disable(request):
    data = validated(MfaCodeInput, request)
    user = request.user
    if not valid_totp(user.mfa_secret, data["code"]):
        raise ValidationError("That verification code is invalid or expired.")
    user.mfa_enabled = False
    user.save(update_fields=["mfa_enabled"])
    audit(request, "mfa_disabled", user.pk)
    return Response({"enabled": False})


@endpoint(["GET", "POST"])
def privacy(request):
    if request.method == "GET":
        return Response([
            {"id": str(item.pk), "kind": item.kind, "status": item.status, "created_at": item.created_at}
            for item in request.user.privacy_requests.order_by("-created_at")[:20]
        ])
    data = validated(PrivacyRequestInput, request)
    item = PrivacyRequest.objects.create(user=request.user, kind=data["kind"])
    audit(request, f"privacy_{data['kind']}_requested", item.pk)
    return Response({"id": str(item.pk), "kind": item.kind, "status": item.status}, status=202)


@endpoint(["GET"])
def privacy_export(request):
    interviews = []
    for interview in request.user.interviews.select_related("invitation__drive__position").prefetch_related("attempts"):
        interviews.append({
            "id": str(interview.pk),
            "status": interview.status,
            "position": interview.invitation.drive.position.title,
            "created_at": interview.created_at,
            "completed_at": interview.completed_at,
            "answers": [
                {"ordinal": attempt.ordinal, "answer": attempt.answer, "submitted_at": attempt.submitted_at}
                for attempt in interview.attempts.order_by("ordinal")
            ],
        })
    return Response({"profile": user_data(request.user)["profile"], "email": request.user.email, "interviews": interviews})


@endpoint(["POST"], public=True)
def request_reset(request):
    return request_email_token(request, "reset")


@endpoint(["POST"], public=True)
def resend_verification(request):
    return request_email_token(request, "verify")


def request_email_token(request, purpose):
    request_limit(request, "email_token", 5, 900)
    data = validated(EmailInput, request)
    email = data["email"].lower()
    limit(f"email_token:{private_hash(email)}", 3, 900)
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user and (purpose == "reset" or not user.verified):
        queue_token(user, purpose)
    audit(request, f"{purpose}_requested")
    return Response(
        {"detail": "If the account is eligible, an email will arrive shortly."},
        status=202,
    )


@endpoint(["POST"], public=True)
def verify(request):
    request_limit(request, "verify", 15, 900)
    data = validated(TokenInput, request)
    with transaction.atomic():
        token = (
            AuthToken.objects.select_for_update()
            .filter(
                digest=digest(data["token"]),
                purpose="verify",
                used_at=None,
                expires_at__gt=timezone.now(),
            )
            .first()
        )
        if not token:
            raise ValidationError("This verification link is invalid or expired.")
        User.objects.filter(pk=token.user_id).update(verified=True)
        token.used_at = timezone.now()
        token.save()
    return Response({"detail": "Email verified. You can sign in now."})


@endpoint(["POST"], public=True)
def reset(request):
    request_limit(request, "reset", 10, 900)
    data = validated(ResetInput, request)
    with transaction.atomic():
        token = (
            AuthToken.objects.select_for_update()
            .filter(
                digest=digest(data["token"]),
                purpose="reset",
                used_at=None,
                expires_at__gt=timezone.now(),
            )
            .first()
        )
        if not token:
            raise ValidationError("This password reset link is invalid or expired.")
        user = User.objects.select_for_update().get(pk=token.user_id)
        validate_password(data["password"], user)
        user.set_password(data["password"])
        user.save()
        AuthToken.objects.filter(user=user, purpose="reset", used_at=None).update(
            used_at=timezone.now()
        )
    audit(request, "password_reset", user.pk)
    return Response({"detail": "Password updated. Existing sessions have been revoked."})
