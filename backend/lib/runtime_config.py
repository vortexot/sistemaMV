"""Production-only configuration checks that fail before the API accepts traffic."""

import ipaddress
import base64
import os
from pathlib import Path
from urllib.parse import urlsplit


def cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    if not raw and os.getenv("APP_ENV") != "production":
        raw = "http://localhost:3000"
    return [value.strip().rstrip("/") for value in raw.split(",") if value.strip() and value.strip() != "*"]


def _https_origin(value: str) -> bool:
    if any(c.isspace() or c == '\\' for c in value):
        return False
    try:
        parsed = urlsplit(value)
        if parsed.port is not None and not 1 <= parsed.port <= 65535:
            return False
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.hostname)
        and not parsed.username
        and not parsed.password
        and parsed.path in ("", "/")
        and not parsed.query
        and not parsed.fragment
    )


def _trusted_proxy_list(value: str) -> bool:
    value = value.strip()
    if value == "*":
        # Render's public port is reachable only through its edge proxy and the
        # platform documents FORWARDED_ALLOW_IPS=* for Python services.
        return os.getenv("RENDER") == "true" and os.getenv("RENDER_SERVICE_TYPE") == "web"
    if not value:
        return False
    try:
        for item in value.split(","):
            if ipaddress.ip_network(item.strip(), strict=False).prefixlen == 0:
                return False
    except ValueError:
        return False
    return True


def _strong_secret(value: str, minimum: int = 32) -> bool:
    lowered = value.strip().lower()
    placeholders = ('change-me', 'changeme', 'example', 'placeholder', 'replace-me', 'secret')
    return len(value.encode()) >= minimum and not any(item in lowered for item in placeholders)


def validate_production_config() -> None:
    environment = os.getenv("APP_ENV")
    if environment not in {"staging", "production"}:
        return

    problems: list[str] = []
    public_origin = os.getenv("PUBLIC_ORIGIN", "").rstrip("/")
    origins = cors_origins()

    if not _strong_secret(os.getenv('JWT_SECRET', '')):
        problems.append('JWT_SECRET must be a non-placeholder secret with at least 32 bytes')
    mongo_url = os.getenv('MONGO_URL', '')
    if not mongo_url or 'localhost' in mongo_url or '127.0.0.1' in mongo_url or 'change-me' in mongo_url.lower():
        problems.append('MONGO_URL must point to the authenticated remote database')
    if not os.getenv('DB_NAME', '').strip():
        problems.append('DB_NAME is required')

    if not _https_origin(public_origin):
        problems.append("PUBLIC_ORIGIN must be one exact HTTPS origin")
    if '*' in os.getenv('CORS_ORIGINS', '') or not origins or any(not _https_origin(origin) for origin in origins):
        problems.append("CORS_ORIGINS must contain only explicit HTTPS origins")
    elif public_origin not in origins:
        problems.append("CORS_ORIGINS must include PUBLIC_ORIGIN")
    if not _trusted_proxy_list(os.getenv("FORWARDED_ALLOW_IPS", "")):
        problems.append("FORWARDED_ALLOW_IPS must contain trusted proxy CIDRs, or * only on a Render web service")
    if os.getenv("STORAGE_PERSISTENT") != "true":
        problems.append("STORAGE_PERSISTENT=true is required after mounting durable upload storage")
    if not os.getenv('STORAGE_DIR') or not Path(os.environ['STORAGE_DIR']).is_absolute():
        problems.append('STORAGE_DIR must be an absolute path to durable upload storage')
    if os.getenv("GOOGLE_AUTH_ENABLED", "false") != "false":
        problems.append("legacy GOOGLE_AUTH_ENABLED must remain false")
    try:
        mfa_key = base64.urlsafe_b64decode(os.getenv('MFA_ENCRYPTION_KEY', '').encode())
    except Exception:
        mfa_key = b''
    if len(mfa_key) != 32:
        problems.append('MFA_ENCRYPTION_KEY must be a urlsafe base64-encoded 32-byte key')
    previous_mfa = os.getenv('MFA_ENCRYPTION_KEY_PREVIOUS', '')
    if previous_mfa:
        try:
            previous_key = base64.urlsafe_b64decode(previous_mfa.encode())
        except Exception:
            previous_key = b''
        if len(previous_key) != 32 or previous_mfa == os.getenv('MFA_ENCRYPTION_KEY'):
            problems.append('MFA_ENCRYPTION_KEY_PREVIOUS must be a different valid Fernet key when set')
    if os.getenv('MFA_REQUIRED') != 'true':
        problems.append('MFA_REQUIRED=true is required in production')

    if os.getenv("PAYMENTS_PAUSED", "true") == "false":
        if not os.getenv("PAYPAL_CLIENT_ID") or not os.getenv("PAYPAL_CLIENT_SECRET"):
            problems.append("PayPal credentials are required when payments are enabled")
        if os.getenv("PAYPAL_MODE") not in {"sandbox", "live"}:
            problems.append("PAYPAL_MODE must be sandbox or live")
        if environment == 'staging' and os.getenv('PAYPAL_MODE') != 'sandbox':
            problems.append('staging can only use PAYPAL_MODE=sandbox')

    reset_url = os.getenv('RESET_WEBHOOK_URL', '')
    if reset_url and (not _strong_secret(os.getenv('RESET_WEBHOOK_TOKEN', ''))
                      or not os.getenv('RESET_WEBHOOK_ALLOWED_HOSTS', '').strip()):
        problems.append('password reset delivery requires a strong token and explicit allowed hosts')

    if problems:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))
