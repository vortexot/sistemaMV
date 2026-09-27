"""Delivery adapter for verification and password-reset messages."""

import logging
import os
from urllib.parse import urlsplit

import httpx


def _settings() -> tuple[str, str, str]:
    endpoint = os.getenv("AUTH_EMAIL_WEBHOOK_URL", "")
    if endpoint:
        return (
            endpoint,
            os.getenv("AUTH_EMAIL_WEBHOOK_TOKEN", ""),
            os.getenv("AUTH_EMAIL_WEBHOOK_ALLOWED_HOSTS", ""),
        )
    return (
        os.getenv("RESET_WEBHOOK_URL", ""),
        os.getenv("RESET_WEBHOOK_TOKEN", ""),
        os.getenv("RESET_WEBHOOK_ALLOWED_HOSTS", ""),
    )


def configured() -> bool:
    endpoint, secret, allowed_raw = _settings()
    allowed = {
        host.strip().lower().rstrip(".")
        for host in allowed_raw.split(",")
        if host.strip()
    }
    parsed = urlsplit(endpoint)
    try:
        port = parsed.port
    except ValueError:
        return False
    return bool(
        parsed.scheme == "https"
        and parsed.hostname
        and parsed.hostname.lower().rstrip(".") in allowed
        and port in (None, 443)
        and not parsed.username
        and not parsed.password
        and secret
    )


async def deliver(action: str, email: str, *, token: str | None, expires_in_seconds: int | None) -> bool:
    if not configured():
        return False
    endpoint, secret, _ = _settings()
    payload = {
        "action": action,
        "email": email,
        "site": os.getenv("PUBLIC_ORIGIN", "http://localhost:3000"),
    }
    if token is not None:
        payload["token"] = token
    if expires_in_seconds is not None:
        payload["expires_in_seconds"] = expires_in_seconds
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.post(
                endpoint,
                headers={"Authorization": "Bearer " + secret},
                json=payload,
            )
            response.raise_for_status()
    except Exception:
        logging.getLogger(__name__).error("auth_email_delivery_failed action=%s", action)
        return False
    return True
