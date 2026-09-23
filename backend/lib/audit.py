"""Structured security events with conservative redaction and stdout-friendly alerts."""

import hashlib
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any


AUDIT_LOGGER = logging.getLogger("security.audit")
ALERT_LOGGER = logging.getLogger("security.alert")

ALERT_EVENTS = {
    "MFA_DISABLED",
    "MFA_RECOVERY_REQUEST",
    "MFA_RECOVERY_COMPLETE",
    "ROLE_CHANGE",
    "PAYMENT_AMBIGUOUS",
}

_SENSITIVE_KEY = re.compile(
    r"password|passwd|authorization|cookie|token|secret|api.?key|connection.?string|mfa.?code|recovery.?code",
    re.IGNORECASE,
)
_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")


def _safe(value: Any, key: str = "") -> Any:
    if _SENSITIVE_KEY.search(key):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {str(k): _safe(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_safe(item) for item in value]
    if isinstance(value, str):
        return _JWT.sub("[REDACTED]", value)[:500]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return str(value)[:500]


def subject_hash(value: str) -> str:
    """Stable pseudonymous identifier for unauthenticated login subjects."""
    return hashlib.sha256(value.strip().lower().encode()).hexdigest()[:16]


def audit_event(
    event: str,
    *,
    actor_id: str | None = None,
    target_id: str | None = None,
    order_id: str | None = None,
    outcome: str = "success",
    request_id: str | None = None,
    details: dict[str, Any] | None = None,
    alert: bool | None = None,
) -> None:
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "request_id": request_id or uuid.uuid4().hex,
        "actor_id": actor_id,
        "target_id": target_id,
        "order_id": order_id,
        "outcome": outcome,
    }
    if details:
        record["details"] = _safe(details)
    payload = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
    AUDIT_LOGGER.info(payload)
    if alert if alert is not None else event in ALERT_EVENTS:
        ALERT_LOGGER.warning(payload)
