"""Transactional Resend transport, with a private file inbox for local development."""

import os
import re

import httpx
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from evaluation.gemini import ProviderError


def render_email(payload):
    links = re.findall(r"https?://[^\s]+", payload["body"])
    link = next((url for url in links if url.startswith(settings.PUBLIC_URL + "/")), "")
    subject = payload["subject"]
    action = (
        "Reset password"
        if "Reset" in subject
        else "Verify email"
        if "Verify" in subject
        else "View invitation"
    )
    return render_to_string(
        "emails/transactional.html",
        {
            "subject": subject,
            "body": payload["body"],
            "link": link,
            "action": action,
        },
    )


def send_email(payload, idempotency_key):
    html = render_email(payload)
    key = os.getenv("RESEND_API_KEY", "").strip()
    if key:
        try:
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {key}", "Idempotency-Key": str(idempotency_key)},
                json={
                    "from": settings.DEFAULT_FROM_EMAIL,
                    "to": [payload["recipient"]],
                    "subject": payload["subject"],
                    "text": payload["body"],
                    "html": html,
                },
                timeout=20,
            )
        except httpx.HTTPError:
            raise ProviderError("email_connection_failed", 60) from None
        if response.status_code == 429:
            raise ProviderError("email_rate_limited", 300)
        if response.status_code in (401, 403, 422):
            raise ProviderError("email_configuration_error", 300)
        if response.status_code not in (200, 201, 202):
            raise ProviderError("email_delivery_failed", 300)
    elif settings.DEBUG:
        message = EmailMultiAlternatives(
            payload["subject"], payload["body"], settings.DEFAULT_FROM_EMAIL, [payload["recipient"]]
        )
        message.attach_alternative(html, "text/html")
        message.send()
    else:
        raise ProviderError("email_not_configured", 300)
