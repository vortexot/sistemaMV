"""Server-side date helpers. The pod clock is UTC — anchor "today" here, never in the browser."""

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def today_iso(tz: str | None = None) -> str:
    """Today's date as YYYY-MM-DD in `tz` (default: APP_TZ env, else UTC)."""
    zone = tz or os.environ.get("APP_TZ", "UTC")
    return datetime.now(ZoneInfo(zone)).strftime("%Y-%m-%d")


def ensure_aware(dt: datetime) -> datetime:
    """Motor hands back naive datetimes — normalise to aware UTC before comparing or serialising."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def utcnow() -> datetime:
    """Aware UTC now — store aware on write so Pydantic serialises with the offset."""
    return datetime.now(timezone.utc)


def with_utc(doc: dict) -> dict:
    """Copy of a Mongo doc with every datetime value made aware UTC (motor returns naive)."""
    return {key: ensure_aware(value) if isinstance(value, datetime) else value for key, value in doc.items()}