"""Auth plumbing: bcrypt hashes, JWT access/refresh tokens, httpOnly cookies, RBAC dependencies."""

import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response

from lib.db import db
from lib.dates import utcnow

JWT_SECRET = os.environ.get("JWT_SECRET", "")
if len(JWT_SECRET.encode()) < 32 or 'change-me' in JWT_SECRET.lower():
    if os.getenv('APP_ENV') == 'production':
        raise RuntimeError('Configure JWT_SECRET aleatório com pelo menos 32 bytes.')
    # Local-only ephemeral key; restarting invalidates local sessions.
    JWT_SECRET = secrets.token_urlsafe(48)
JWT_ISSUER = 'mv-multimarcas'
JWT_AUDIENCE = 'mv-api'
ACCESS_TTL = timedelta(minutes=30)
REFRESH_TTL = timedelta(days=7)
ACCESS_COOKIE = "gs_access_token"
REFRESH_COOKIE = "gs_refresh_token"


def hash_password(password: str) -> str:
    if len(password.encode('utf-8')) > 72:
        raise ValueError('A senha excede 72 bytes UTF-8.')
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    if len(password.encode('utf-8')) > 72:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def _create_token(user: dict, token_type: str, expires: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["id"],
        "role": user.get("role", "comprador"),
        "type": token_type,
        "tv": user.get("token_version", 0),
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + expires,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def create_access_token(user: dict) -> str:
    return _create_token(user, "access", ACCESS_TTL)


def create_refresh_token(user: dict) -> str:
    return _create_token(user, "refresh", REFRESH_TTL)


def decode_token(token: str, expected_type: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], issuer=JWT_ISSUER,
                             audience=JWT_AUDIENCE,
                             options={'require': ['sub', 'jti', 'iat', 'exp', 'iss', 'aud', 'tv', 'type']})
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type or not isinstance(payload.get('tv'), int):
        return None
    return payload


def set_session_cookies(response: Response, access: str, refresh: str) -> None:
    secure = os.getenv('APP_ENV') == 'production' or os.getenv('COOKIE_SECURE') == 'true'
    common = {"httponly": True, "samesite": "lax", "path": "/", "secure": secure}
    response.set_cookie(ACCESS_COOKIE, access, max_age=int(ACCESS_TTL.total_seconds()), **common)
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=int(REFRESH_TTL.total_seconds()), **common)


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")


async def revoke_token(payload: dict[str, Any]) -> bool:
    exp = payload.get("exp")
    expires_at = datetime.fromtimestamp(exp, tz=timezone.utc) if exp else utcnow() + REFRESH_TTL
    result = await db.revoked_tokens.update_one(
        {"jti": payload["jti"]},
        {"$setOnInsert": {"jti": payload["jti"], "expires_at": expires_at, "revoked_at": utcnow()}},
        upsert=True,
    )
    return result.upserted_id is not None


async def is_revoked(jti: str) -> bool:
    return await db.revoked_tokens.find_one({"jti": jti}) is not None


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    payload = decode_token(token, "access")
    if payload is None:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or user.get("status") != "ativo" or await is_revoked(payload['jti']):
        raise HTTPException(status_code=401, detail="Não autenticado")
    if payload.get("tv", 0) != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Sessão revogada. Faça login novamente.")
    request.state.audit_actor = user['id']
    return user


def require_roles(*roles: str):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Você não tem permissão para esta ação")
        return user

    return checker
