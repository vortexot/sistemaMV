"""Provision the first synthetic staging administrator with MFA enabled.

Run this only from a trusted one-off shell connected to the staging MongoDB.
The TOTP seed and recovery codes are printed once and must never be pasted into
chat, committed, or copied to provider logs.
"""

import asyncio
import getpass
import os
import re
import sys
import uuid
from pathlib import Path

import pyotp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.dates import utcnow
from lib.db import client, db, ensure_indexes
from lib.mfa import encrypt_secret, new_recovery_codes, new_secret, provisioning_uri, recovery_digest
from lib.runtime_config import validate_production_config
from lib.security import hash_password


EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _prompt() -> tuple[str, str, str]:
    email = input("Synthetic staging admin email: ").strip().lower()
    name = input("Synthetic staging admin name: ").strip()
    password = getpass.getpass("New staging-only password (15-72 UTF-8 bytes): ")
    confirmation = getpass.getpass("Confirm password: ")
    if not EMAIL.fullmatch(email):
        raise SystemExit("Invalid email address.")
    if len(name) < 2 or len(name) > 120:
        raise SystemExit("Name must contain 2-120 characters.")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    if len(password) < 15 or len(password.encode("utf-8")) > 72:
        raise SystemExit("Password must contain 15-72 UTF-8 bytes.")
    return email, name, password


async def provision() -> None:
    if os.getenv("APP_ENV") != "staging":
        raise SystemExit("Refusing to run unless APP_ENV=staging.")
    if os.getenv("PAYMENTS_PAUSED", "true") != "true":
        raise SystemExit("Refusing to run while staging payments are unpaused.")

    validate_production_config()
    email, name, password = _prompt()
    await ensure_indexes()
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise SystemExit("A user with that email already exists; nothing changed.")

    user_id = str(uuid.uuid4())
    secret = new_secret()
    print("\nAdd this staging-only TOTP account to your authenticator:")
    print(provisioning_uri(secret, email))
    print("Do not paste this URI or its secret into chat or provider logs.\n")
    code = input("Current authenticator code: ").strip()
    if not pyotp.TOTP(secret).verify(code, valid_window=0):
        raise SystemExit("Invalid TOTP code; nothing changed.")

    recovery_codes = new_recovery_codes()
    await db.users.insert_one(
        {
            "id": user_id,
            "name": name,
            "email": email,
            "password_hash": hash_password(password),
            "role": "admin",
            "status": "ativo",
            "picture": None,
            "token_version": 0,
            "mfa_enabled": True,
            "mfa_secret": encrypt_secret(secret),
            "mfa_recovery_codes": [recovery_digest(user_id, item) for item in recovery_codes],
            "created_at": utcnow(),
        }
    )
    print("\nAdministrator created. Store these one-use recovery codes securely now:")
    for item in recovery_codes:
        print(item)
    print("\nThey cannot be displayed again. Do not paste them into chat or provider logs.")


if __name__ == "__main__":
    try:
        asyncio.run(provision())
    finally:
        client.close()
