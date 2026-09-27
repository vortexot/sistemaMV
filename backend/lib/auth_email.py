"""Delivery adapter for verification and password-reset messages."""

from html import escape
import hashlib
import logging
import os
from urllib.parse import urlsplit

import httpx


RESEND_ENDPOINT = "https://api.resend.com/emails"


def _provider() -> str:
    return os.getenv("AUTH_EMAIL_PROVIDER", "webhook").strip().lower()


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
    if _provider() == "resend":
        return bool(
            os.getenv("RESEND_API_KEY", "").strip()
            and os.getenv("AUTH_EMAIL_FROM", "").strip()
        )
    if _provider() != "webhook":
        return False
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


def _message(
    action: str,
    token: str | None,
    expires_in_seconds: int | None,
    site: str,
) -> tuple[str, str, str]:
    minutes = max(1, (expires_in_seconds or 0) // 60)
    safe_site = escape(site)
    safe_token = escape(token or "")
    if action == "verify_email":
        subject = "Confirme seu e-mail — MV Multimarcas"
        text = (
            f"Use este código para confirmar seu cadastro: {token}\n\n"
            f"O código expira em {minutes} minutos. "
            f"Se você não solicitou o cadastro, ignore esta mensagem.\n\n{site}"
        )
        body = (
            "<h1>Confirme seu e-mail</h1>"
            "<p>Use o código abaixo na tela de cadastro da MV Multimarcas:</p>"
            f"<p style=\"font-size:20px;font-weight:700;letter-spacing:1px;word-break:break-all\">{safe_token}</p>"
            f"<p>O código expira em {minutes} minutos.</p>"
            "<p>Se você não solicitou o cadastro, ignore esta mensagem.</p>"
        )
    elif action == "reset_password":
        subject = "Redefinição de senha — MV Multimarcas"
        text = (
            f"Use este código para redefinir sua senha: {token}\n\n"
            f"O código expira em {minutes} minutos. "
            f"Se você não solicitou a alteração, ignore esta mensagem.\n\n{site}"
        )
        body = (
            "<h1>Redefinição de senha</h1>"
            "<p>Use o código abaixo na tela de recuperação da MV Multimarcas:</p>"
            f"<p style=\"font-size:20px;font-weight:700;letter-spacing:1px;word-break:break-all\">{safe_token}</p>"
            f"<p>O código expira em {minutes} minutos.</p>"
            "<p>Se você não solicitou a alteração, ignore esta mensagem.</p>"
        )
    else:
        subject = "Tentativa de cadastro — MV Multimarcas"
        text = (
            "Recebemos uma tentativa de cadastro com este e-mail. "
            f"Se não foi você, nenhuma ação é necessária.\n\n{site}"
        )
        body = (
            "<h1>Tentativa de cadastro</h1>"
            "<p>Recebemos uma tentativa de cadastro com este e-mail.</p>"
            "<p>Se não foi você, nenhuma ação é necessária.</p>"
        )
    html = (
        "<!doctype html><html lang=\"pt-BR\"><body style=\"margin:0;background:#0b0b0b;color:#f5f5f5;"
        "font-family:Arial,sans-serif\"><main style=\"max-width:560px;margin:0 auto;padding:32px\">"
        "<p style=\"color:#daa520;font-weight:700;letter-spacing:2px\">MV MULTIMARCAS</p>"
        f"{body}<p><a href=\"{safe_site}\" style=\"color:#daa520\">Acessar a loja</a></p>"
        "</main></body></html>"
    )
    return subject, text, html


async def _deliver_resend(
    action: str,
    email: str,
    token: str | None,
    expires_in_seconds: int | None,
) -> bool:
    site = os.getenv("PUBLIC_ORIGIN", "http://localhost:3000")
    subject, text, html = _message(action, token, expires_in_seconds, site)
    idempotency_source = f"{action}:{email}:{token or 'notice'}"
    idempotency_key = "auth/" + hashlib.sha256(idempotency_source.encode()).hexdigest()
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.post(
                RESEND_ENDPOINT,
                headers={
                    "Authorization": "Bearer " + os.getenv("RESEND_API_KEY", ""),
                    "Idempotency-Key": idempotency_key,
                },
                json={
                    "from": os.getenv("AUTH_EMAIL_FROM", ""),
                    "to": [email],
                    "subject": subject,
                    "text": text,
                    "html": html,
                },
            )
            response.raise_for_status()
    except Exception:
        logging.getLogger(__name__).error(
            "auth_email_delivery_failed provider=resend action=%s", action
        )
        return False
    return True


async def deliver(
    action: str,
    email: str,
    *,
    token: str | None,
    expires_in_seconds: int | None,
) -> bool:
    if not configured():
        return False
    if _provider() == "resend":
        return await _deliver_resend(action, email, token, expires_in_seconds)
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
