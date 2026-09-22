"""Auth routes: register, login (com lockout), refresh rotation, logout, me, password reset, Google (Emergent)."""

import uuid
import os
import secrets
import hashlib
import logging
from urllib.parse import urlsplit
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.db import db
from lib.dates import utcnow, with_utc
from lib.security import (
    clear_session_cookies,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    is_revoked,
    revoke_token,
    set_session_cookies,
    verify_password,
)
from models.auth import (
    ForgotPasswordIn,
    GoogleSessionIn,
    LoginIn,
    MessageOut,
    RegisterIn,
    ResetPasswordIn,
    UserPublic,
)

router = APIRouter(prefix="/auth")

@router.get('/options')
async def options():
    return {'google_enabled': os.getenv('GOOGLE_AUTH_ENABLED') == 'true'}

LOCKOUT_WINDOW = timedelta(minutes=15)
LOCKOUT_MAX_FAILURES = 5

PUBLIC_FIELDS = ("id", "name", "email", "role", "status", "picture", "created_at")
DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


def _public(user: dict) -> dict:
    return with_utc({key: user.get(key) for key in PUBLIC_FIELDS})


def _issue(response: Response, user: dict) -> UserPublic:
    access = create_access_token(user)
    refresh = create_refresh_token(user)
    set_session_cookies(response, access, refresh)
    return UserPublic(**_public(user))


async def _record_attempt(email: str, request: Request, success: bool) -> None:
    ip = request.client.host if request.client else ""
    await db.login_attempts.insert_one(
        {"email": email, "ip": ip, "success": success, "created_at": utcnow()}
    )


async def _rate_limit(request: Request, action: str, email: str = '', maximum: int = 10):
    # Pair with source, never lock an account globally using attacker-controlled failures.
    ip = request.client.host if request.client else 'unknown'
    for label, value, limit in [('source', ip, 50), ('pair', ip + ':' + email, maximum)]:
        window = int(utcnow().timestamp()) // 900
        key = hashlib.sha256(f'{action}:{label}:{value}:{window}'.encode()).hexdigest()
        row = await db.auth_limits.find_one_and_update(
            {'_id': key}, {'$inc': {'count': 1}, '$setOnInsert': {'expires_at': utcnow() + timedelta(minutes=30)}},
            upsert=True, return_document=ReturnDocument.AFTER)
        if row['count'] > limit:
            raise HTTPException(429, 'Muitas tentativas. Aguarde alguns minutos.')


@router.post("/register", response_model=UserPublic)
async def register(input: RegisterIn, request: Request, response: Response) -> UserPublic:
    email = input.email.lower().strip()
    await _rate_limit(request, 'register', email)
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Este e-mail já possui uma conta.")
    user = {
        "id": str(uuid.uuid4()),
        "name": input.name.strip(),
        "email": email,
        "password_hash": hash_password(input.password),
        "role": "comprador",
        "status": "ativo",
        "picture": None,
        "token_version": 0,
        "created_at": utcnow(),
    }
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(409, 'Não foi possível cadastrar esta conta.')
    return _issue(response, user)


@router.post("/login", response_model=UserPublic)
async def login(input: LoginIn, request: Request, response: Response) -> UserPublic:
    email = input.email.lower().strip()
    await _rate_limit(request, 'login', email)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    valid = verify_password(input.password, user.get('password_hash') if user else DUMMY_HASH)
    if not user or not valid or user.get('status') != 'ativo':
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")
    return _issue(response, user)


@router.post("/refresh", response_model=UserPublic)
async def refresh(request: Request, response: Response) -> UserPublic:
    token = request.cookies.get("gs_refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Sessão expirada.")
    payload = decode_token(token, "refresh")
    if payload is None:
        raise HTTPException(status_code=401, detail="Sessão expirada.")
    if await is_revoked(payload["jti"]):
        raise HTTPException(status_code=401, detail="Sessão revogada.")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if (
        not user
        or user.get("status") != "ativo"
        or payload.get("tv", 0) != user.get("token_version", 0)
    ):
        raise HTTPException(status_code=401, detail="Sessão expirada.")
    if not await revoke_token(payload):
        raise HTTPException(401, 'Sessão revogada.')
    return _issue(response, user)


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict:
    for name, kind in [('gs_refresh_token', 'refresh'), ('gs_access_token', 'access')]:
        token = request.cookies.get(name)
        payload = decode_token(token, kind) if token else None
        if payload:
            await revoke_token(payload)
            # Revoke the account's existing tokens, including concurrent refresh descendants.
            await db.users.update_one({'id': payload['sub'], 'token_version': payload['tv']}, {'$inc': {'token_version': 1}})
    clear_session_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
async def me_current(user: dict = Depends(get_current_user)) -> UserPublic:
    return UserPublic(**_public(user))


@router.post("/forgot-password", response_model=MessageOut)
async def forgot_password(input: ForgotPasswordIn, request: Request) -> MessageOut:
    email = input.email.lower().strip()
    await _rate_limit(request, 'forgot', email, 5)
    endpoint, secret = os.getenv('RESET_WEBHOOK_URL', ''), os.getenv('RESET_WEBHOOK_TOKEN', '')
    parsed = urlsplit(endpoint)
    allowed_hosts = {
        host.strip().lower().rstrip('.')
        for host in os.getenv('RESET_WEBHOOK_ALLOWED_HOSTS', '').split(',')
        if host.strip()
    }
    endpoint_host = (parsed.hostname or '').lower().rstrip('.')
    try:
        endpoint_port = parsed.port
    except ValueError:
        endpoint_port = -1
    if (
        parsed.scheme != 'https'
        or not endpoint_host
        or endpoint_host not in allowed_hosts
        or endpoint_port not in (None, 443)
        or parsed.username
        or parsed.password
        or not secret
    ):
        raise HTTPException(503, 'Recuperação por e-mail indisponível. Fale com o administrador.')
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        # Generic answer — never reveal whether the account exists.
        return MessageOut(
            message="Se este e-mail estiver cadastrado, você receberá as instruções de redefinição."
        )
    token = secrets.token_urlsafe(48)
    digest = hashlib.sha256(token.encode()).hexdigest()
    await db.password_reset_tokens.insert_one(
        {
            "token": digest,
            "token_version": user.get('token_version', 0),
            "user_id": user["id"],
            "used": False,
            "created_at": utcnow(),
            "expires_at": utcnow() + timedelta(minutes=30),
        }
    )
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            resp = await client.post(endpoint, headers={'Authorization': 'Bearer ' + secret},
                                     json={'email': email, 'token': token, 'site': os.getenv('PUBLIC_ORIGIN', 'http://localhost:3000')})
            resp.raise_for_status()
    except Exception:
        await db.password_reset_tokens.delete_one({'token': digest})
        logging.getLogger(__name__).error('password_reset_delivery_failed')
    return MessageOut(message='Se este e-mail estiver cadastrado, você receberá as instruções de redefinição.')


@router.post("/reset-password", response_model=MessageOut)
async def reset_password(input: ResetPasswordIn, request: Request) -> MessageOut:
    await _rate_limit(request, 'reset')
    password_hash = hash_password(input.new_password)
    digest = hashlib.sha256(input.token.encode()).hexdigest()
    doc = await db.password_reset_tokens.find_one_and_update(
        {'token': digest, 'used': False, 'expires_at': {'$gt': utcnow()}}, {'$set': {'used': True}})
    if not doc:
        raise HTTPException(status_code=400, detail="Token inválido ou já utilizado.")
    expires_at = doc["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo link.")
    user = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido.")
    result = await db.users.update_one(
        {'id': user['id'], 'token_version': doc.get('token_version', 0)},
        {'$set': {'password_hash': password_hash}, '$inc': {'token_version': 1}},
    )
    if not result.modified_count:
        raise HTTPException(400, 'Token inválido ou expirado.')
    return MessageOut(message="Senha redefinida com sucesso. Faça login novamente.")


@router.post("/google/session", response_model=UserPublic)
async def google_session(input: GoogleSessionIn, request: Request, response: Response) -> UserPublic:
    if os.getenv('GOOGLE_AUTH_ENABLED') != 'true':
        raise HTTPException(503, 'Login Google indisponível.')
    await _rate_limit(request, 'google')
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": input.session_id},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Falha ao validar a sessão Google.")
        data = resp.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Falha ao validar a sessão Google.")

    email = str(data.get("email", "")).lower().strip()
    if not email:
        raise HTTPException(status_code=401, detail="Sessão Google sem e-mail válido.")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        # Never silently link an external identity to a password/staff account by email alone.
        if existing.get('password_hash') or existing.get('role') != 'comprador' or existing.get('status') != 'ativo':
            raise HTTPException(401, 'Não foi possível entrar com esta identidade.')
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"name": data.get("name") or existing["name"], "picture": data.get("picture")}},
        )
        user = await db.users.find_one({"id": existing["id"]}, {"_id": 0})
    else:
        user = {
            "id": str(uuid.uuid4()),
            "name": data.get("name") or email.split("@")[0],
            "email": email,
            "password_hash": None,
            "role": "comprador",
            "status": "ativo",
            "picture": data.get("picture"),
            "token_version": 0,
            "created_at": utcnow(),
        }
        await db.users.insert_one(user)
    return _issue(response, user)
