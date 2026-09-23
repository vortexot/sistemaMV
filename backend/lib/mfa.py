"""TOTP and one-use recovery codes for staff accounts."""

import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from lib.db import db
from lib.audit import audit_event


def _cipher(name: str = "MFA_ENCRYPTION_KEY") -> Fernet:
    raw = os.getenv(name, "")
    try:
        key = base64.urlsafe_b64decode(raw.encode())
    except Exception as error:
        raise HTTPException(503, "MFA indisponível: chave inválida.") from error
    if len(key) != 32:
        raise HTTPException(503, "MFA indisponível: chave inválida.")
    return Fernet(raw.encode())


def new_secret() -> str:
    return pyotp.random_base32()


def encrypt_secret(secret: str) -> str:
    return _cipher().encrypt(secret.encode()).decode()


def decrypt_secret(value: str) -> str:
    ciphers = [_cipher()]
    if os.getenv('MFA_ENCRYPTION_KEY_PREVIOUS'):
        ciphers.append(_cipher('MFA_ENCRYPTION_KEY_PREVIOUS'))
    for cipher in ciphers:
        try:
            return cipher.decrypt(value.encode()).decode()
        except InvalidToken:
            continue
    raise HTTPException(503, "MFA secret cannot be decrypted.")


def provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="MV Multimarcas")


def recovery_digest(user_id: str, code: str) -> str:
    return hashlib.sha256(f"{user_id}:{code.strip().lower()}".encode()).hexdigest()


def new_recovery_codes() -> list[str]:
    return [f"{secrets.token_hex(4)}-{secrets.token_hex(4)}" for _ in range(10)]


async def verify_second_factor(user: dict, code: str | None, *, consume_recovery: bool = True) -> bool:
    if not user.get("mfa_enabled") or not code:
        return False
    normalized = code.strip().replace(" ", "")
    secret = decrypt_secret(user.get("mfa_secret", ""))
    totp = pyotp.TOTP(secret)
    now = datetime.now(timezone.utc)
    for offset in (0,):
        moment = now + timedelta(seconds=offset * totp.interval)
        if pyotp.utils.strings_equal(totp.at(moment), normalized):
            if not consume_recovery:
                return True
            counter = totp.timecode(moment)
            result = await db.users.update_one(
                {'id': user['id'], '$or': [
                    {'mfa_last_counter': {'$lt': counter}}, {'mfa_last_counter': {'$exists': False}},
                ]},
                {'$set': {'mfa_last_counter': counter}},
            )
            return result.modified_count == 1
    digest = recovery_digest(user["id"], normalized)
    if digest not in user.get("mfa_recovery_codes", []):
        return False
    if not consume_recovery:
        return True
    result = await db.users.update_one(
        {"id": user["id"], "mfa_recovery_codes": digest},
        {"$pull": {"mfa_recovery_codes": digest}},
    )
    if result.modified_count == 1:
        audit_event("MFA_RECOVERY_USED", actor_id=user["id"])
    return result.modified_count == 1
