"""Auth routes: register, login, refresh rotation, logout and password recovery."""

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
import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.db import db
from lib.dates import utcnow, with_utc
from lib.audit import audit_event, subject_hash
from lib.mfa import (
    encrypt_secret,
    new_recovery_codes,
    new_secret,
    provisioning_uri,
    recovery_digest,
    verify_second_factor,
    decrypt_secret,
)
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
    require_recent_auth,
)
from models.auth import (
    ForgotPasswordIn,
    LoginIn,
    MessageOut,
    MfaConfirmIn,
    MfaConfirmOut,
    MfaAdminRecoveryCompleteIn,
    MfaAdminRecoveryRequestOut,
    MfaAdminRecoverySetupIn,
    MfaDisableIn,
    MfaSetupIn,
    MfaSetupOut,
    PasswordChangeIn,
    ReauthenticateIn,
    RegisterIn,
    ResetPasswordIn,
    UserPublic,
)

router = APIRouter(prefix="/auth")

LOCKOUT_WINDOW = timedelta(minutes=15)
LOCKOUT_MAX_FAILURES = 5

PUBLIC_FIELDS = ("id", "name", "email", "role", "status", "picture", "mfa_enabled", "created_at")
DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


def _public(user: dict) -> dict:
    result = {key: user.get(key) for key in PUBLIC_FIELDS}
    result['mfa_enabled'] = bool(user.get('mfa_enabled'))
    return with_utc(result)


def _issue(response: Response, user: dict, authenticated_at: int | None = None,
           reauthenticated_at: int | None = None, mfa_verified: bool = False) -> UserPublic:
    access = create_access_token(user, authenticated_at, reauthenticated_at, mfa_verified)
    refresh = create_refresh_token(user, authenticated_at, reauthenticated_at, mfa_verified)
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
            if action in {'login', 'reauth', 'reset'}:
                audit_event('LOGIN_FAILURE', target_id=subject_hash(email) if email else None,
                            outcome='rate_limited', alert=True)
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
        audit_event('LOGIN_FAILURE', target_id=subject_hash(email), outcome='invalid_credentials')
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")
    mfa_verified = False
    if user.get('mfa_enabled'):
        mfa_verified = await verify_second_factor(user, input.mfa_code)
        if not mfa_verified:
            audit_event('LOGIN_FAILURE', target_id=user['id'], outcome='invalid_second_factor')
            raise HTTPException(status_code=401, detail="Código do autenticador ou de recuperação inválido.")
    elif user.get('role') in {'admin', 'atendente'} and os.getenv('MFA_REQUIRED') == 'true':
        audit_event('LOGIN_FAILURE', target_id=user['id'], outcome='mfa_required')
        raise HTTPException(status_code=403, detail="A equipe precisa ativar MFA antes de entrar.")
    audit_event('LOGIN_SUCCESS', actor_id=user['id'])
    return _issue(response, user, mfa_verified=mfa_verified)


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
    return _issue(response, user, payload['auth_time'], payload['reauth_at'], payload['mfa'])


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict:
    tokens = [(request.cookies.get('gs_refresh_token'), 'refresh'), (request.cookies.get('gs_access_token'), 'access')]
    actor_id = None
    authorization = request.headers.get('Authorization', '')
    if authorization.startswith('Bearer '):
        tokens.append((authorization[7:], 'access'))
    for token, kind in tokens:
        payload = decode_token(token, kind) if token else None
        if payload:
            actor_id = payload['sub']
            await revoke_token(payload)
            # Revoke the account's existing tokens, including concurrent refresh descendants.
            await db.users.update_one({'id': payload['sub'], 'token_version': payload['tv']}, {'$inc': {'token_version': 1}})
    audit_event('LOGOUT', actor_id=actor_id)
    clear_session_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
async def me_current(user: dict = Depends(get_current_user)) -> UserPublic:
    return UserPublic(**_public(user))


@router.post('/change-password', response_model=MessageOut)
async def change_password(input: PasswordChangeIn, user: dict = Depends(get_current_user)) -> MessageOut:
    if not verify_password(input.current_password, user.get('password_hash')):
        raise HTTPException(401, 'Senha atual inválida.')
    if user.get('mfa_enabled') and not await verify_second_factor(user, input.mfa_code):
        raise HTTPException(401, 'Segundo fator inválido.')
    result = await db.users.update_one(
        {'id': user['id'], 'token_version': user.get('token_version', 0)},
        {'$set': {'password_hash': hash_password(input.new_password)}, '$inc': {'token_version': 1}},
    )
    if not result.modified_count:
        raise HTTPException(409, 'A conta foi alterada. Entre novamente.')
    audit_event('PASSWORD_CHANGE', actor_id=user['id'], target_id=user['id'])
    return MessageOut(message='Senha alterada. Entre novamente em todos os dispositivos.')


@router.post('/reauthenticate', response_model=UserPublic)
async def reauthenticate(input: ReauthenticateIn, request: Request, response: Response,
                         user: dict = Depends(get_current_user)) -> UserPublic:
    await _rate_limit(request, 'reauth', user['email'], 5)
    if not verify_password(input.password, user.get('password_hash')):
        raise HTTPException(401, 'Credenciais inválidas.')
    mfa_verified = False
    if user.get('mfa_enabled'):
        mfa_verified = await verify_second_factor(user, input.mfa_code)
        if not mfa_verified:
            raise HTTPException(401, 'Credenciais inválidas.')
    payload = request.state.auth_payload
    return _issue(response, user, payload['auth_time'], mfa_verified=mfa_verified)


@router.post('/mfa/setup', response_model=MfaSetupOut)
async def mfa_setup(input: MfaSetupIn, user: dict = Depends(get_current_user)) -> MfaSetupOut:
    if user.get('role') not in {'admin', 'atendente'}:
        raise HTTPException(403, 'MFA de equipe não está disponível para esta conta.')
    if user.get('mfa_enabled'):
        raise HTTPException(409, 'MFA já está ativo.')
    if not verify_password(input.current_password, user.get('password_hash')):
        raise HTTPException(401, 'Senha atual inválida.')
    secret = new_secret()
    expires_at = utcnow() + timedelta(minutes=10)
    await db.users.update_one(
        {'id': user['id']},
        {'$set': {'mfa_pending_secret': encrypt_secret(secret), 'mfa_pending_expires_at': expires_at}},
    )
    return MfaSetupOut(secret=secret, provisioning_uri=provisioning_uri(secret, user['email']),
                       expires_in_seconds=600)


@router.post('/mfa/confirm', response_model=MfaConfirmOut)
async def mfa_confirm(input: MfaConfirmIn, response: Response,
                      user: dict = Depends(get_current_user)) -> MfaConfirmOut:
    if user.get('mfa_enabled'):
        raise HTTPException(409, 'MFA já está ativo.')
    if not verify_password(input.current_password, user.get('password_hash')):
        raise HTTPException(401, 'Senha atual inválida.')
    fresh = await db.users.find_one({'id': user['id']}, {'_id': 0})
    expires_at = fresh.get('mfa_pending_expires_at') if fresh else None
    if not expires_at or expires_at < utcnow() or not fresh.get('mfa_pending_secret'):
        raise HTTPException(400, 'Configuração expirada. Inicie novamente.')
    secret = decrypt_secret(fresh['mfa_pending_secret'])
    if not pyotp.TOTP(secret).verify(input.code, valid_window=0):
        raise HTTPException(401, 'Código inválido.')
    codes = new_recovery_codes()
    digests = [recovery_digest(user['id'], code) for code in codes]
    result = await db.users.update_one(
        {'id': user['id'], 'token_version': user.get('token_version', 0), 'mfa_enabled': {'$ne': True}},
        {'$set': {'mfa_enabled': True, 'mfa_secret': encrypt_secret(secret), 'mfa_recovery_codes': digests},
         '$unset': {'mfa_pending_secret': '', 'mfa_pending_expires_at': ''}, '$inc': {'token_version': 1}},
    )
    if not result.modified_count:
        raise HTTPException(409, 'A conta foi alterada. Inicie novamente.')
    clear_session_cookies(response)
    audit_event('MFA_ENABLED', actor_id=user['id'], target_id=user['id'])
    return MfaConfirmOut(recovery_codes=codes)


@router.post('/mfa/recovery-codes/regenerate', response_model=MfaConfirmOut)
async def regenerate_recovery_codes(response: Response,
                                    user: dict = Depends(require_recent_auth('admin', 'atendente'))) -> MfaConfirmOut:
    if not user.get('mfa_enabled'):
        raise HTTPException(409, 'MFA is not active.')
    codes = new_recovery_codes()
    digests = [recovery_digest(user['id'], code) for code in codes]
    result = await db.users.update_one(
        {'id': user['id'], 'token_version': user.get('token_version', 0), 'mfa_enabled': True},
        {'$set': {'mfa_recovery_codes': digests}, '$inc': {'token_version': 1}},
    )
    if not result.modified_count:
        raise HTTPException(409, 'Account changed. Sign in again.')
    clear_session_cookies(response)
    audit_event('MFA_RECOVERY_CODES_REGENERATED', actor_id=user['id'], target_id=user['id'], alert=True)
    return MfaConfirmOut(recovery_codes=codes)


@router.post('/mfa/admin-recovery/request/{user_id}', response_model=MfaAdminRecoveryRequestOut)
async def request_admin_mfa_recovery(user_id: str,
                                     admin: dict = Depends(require_recent_auth('admin'))) -> MfaAdminRecoveryRequestOut:
    if user_id == admin['id']:
        raise HTTPException(400, 'Use your recovery codes. Administrators cannot recover their own account.')
    target = await db.users.find_one({'id': user_id, 'status': 'ativo'}, {'_id': 0})
    if not target or target.get('role') not in {'admin', 'atendente'} or not target.get('mfa_enabled'):
        raise HTTPException(404, 'Eligible internal account not found.')
    token = secrets.token_urlsafe(48)
    digest = hashlib.sha256(token.encode()).hexdigest()
    expires_at = utcnow() + timedelta(minutes=30)
    result = await db.users.update_one(
        {'id': user_id, 'token_version': target.get('token_version', 0), 'mfa_enabled': True},
        {'$set': {
            'mfa_admin_recovery_digest': digest,
            'mfa_admin_recovery_expires_at': expires_at,
            'mfa_admin_recovery_requested_by': admin['id'],
        }, '$unset': {
            'mfa_recovery_pending_secret': '',
            'mfa_recovery_pending_expires_at': '',
        }, '$inc': {'token_version': 1}},
    )
    if not result.modified_count:
        raise HTTPException(409, 'Account changed. Refresh and try again.')
    audit_event('MFA_RECOVERY_REQUEST', actor_id=admin['id'], target_id=user_id)
    return MfaAdminRecoveryRequestOut(recovery_token=token, expires_in_seconds=1800)


async def _admin_recovery_user(email: str, password: str, token: str) -> tuple[dict, str]:
    digest = hashlib.sha256(token.encode()).hexdigest()
    user = await db.users.find_one({
        'email': email.lower().strip(),
        'status': 'ativo',
        'role': {'$in': ['admin', 'atendente']},
        'mfa_enabled': True,
        'mfa_admin_recovery_digest': digest,
        'mfa_admin_recovery_expires_at': {'$gt': utcnow()},
    }, {'_id': 0})
    if not user or not verify_password(password, user.get('password_hash')):
        raise HTTPException(401, 'Invalid recovery credentials.')
    return user, digest


@router.post('/mfa/admin-recovery/setup', response_model=MfaSetupOut)
async def setup_admin_mfa_recovery(input: MfaAdminRecoverySetupIn, request: Request) -> MfaSetupOut:
    await _rate_limit(request, 'mfa-admin-recovery', input.email.lower().strip(), 5)
    user, digest = await _admin_recovery_user(input.email, input.password, input.recovery_token)
    secret = new_secret()
    expires_at = utcnow() + timedelta(minutes=10)
    await db.users.update_one(
        {'id': user['id'], 'mfa_admin_recovery_digest': digest},
        {'$set': {
            'mfa_recovery_pending_secret': encrypt_secret(secret),
            'mfa_recovery_pending_expires_at': expires_at,
        }},
    )
    return MfaSetupOut(secret=secret, provisioning_uri=provisioning_uri(secret, user['email']),
                       expires_in_seconds=600)


@router.post('/mfa/admin-recovery/complete', response_model=MfaConfirmOut)
async def complete_admin_mfa_recovery(input: MfaAdminRecoveryCompleteIn,
                                      request: Request) -> MfaConfirmOut:
    await _rate_limit(request, 'mfa-admin-recovery', input.email.lower().strip(), 5)
    user, digest = await _admin_recovery_user(input.email, input.password, input.recovery_token)
    pending_expires = user.get('mfa_recovery_pending_expires_at')
    encrypted = user.get('mfa_recovery_pending_secret')
    if not pending_expires or pending_expires < utcnow() or not encrypted:
        raise HTTPException(400, 'Recovery setup expired. Start again.')
    secret = decrypt_secret(encrypted)
    if not pyotp.TOTP(secret).verify(input.code, valid_window=0):
        raise HTTPException(401, 'Invalid recovery credentials.')
    codes = new_recovery_codes()
    digests = [recovery_digest(user['id'], code) for code in codes]
    result = await db.users.update_one(
        {
            'id': user['id'],
            'mfa_admin_recovery_digest': digest,
            'mfa_admin_recovery_expires_at': {'$gt': utcnow()},
        },
        {'$set': {
            'mfa_enabled': True,
            'mfa_secret': encrypt_secret(secret),
            'mfa_recovery_codes': digests,
        }, '$unset': {
            'mfa_last_counter': '',
            'mfa_admin_recovery_digest': '',
            'mfa_admin_recovery_expires_at': '',
            'mfa_admin_recovery_requested_by': '',
            'mfa_recovery_pending_secret': '',
            'mfa_recovery_pending_expires_at': '',
        }, '$inc': {'token_version': 1}},
    )
    if not result.modified_count:
        raise HTTPException(409, 'Recovery was already used or expired.')
    audit_event('MFA_RECOVERY_COMPLETE', actor_id=user['id'], target_id=user['id'])
    return MfaConfirmOut(recovery_codes=codes)


@router.post('/mfa/disable', response_model=MessageOut)
async def mfa_disable(input: MfaDisableIn, response: Response,
                      user: dict = Depends(get_current_user)) -> MessageOut:
    if os.getenv('MFA_REQUIRED') == 'true' and user.get('role') in {'admin', 'atendente'}:
        raise HTTPException(409, 'MFA é obrigatório para a equipe. Use um processo de recuperação aprovado.')
    if not verify_password(input.current_password, user.get('password_hash')):
        raise HTTPException(401, 'Credenciais inválidas.')
    if not await verify_second_factor(user, input.code):
        raise HTTPException(401, 'Credenciais inválidas.')
    await db.users.update_one(
        {'id': user['id']},
        {'$set': {'mfa_enabled': False}, '$unset': {'mfa_secret': '', 'mfa_recovery_codes': ''},
         '$inc': {'token_version': 1}},
    )
    audit_event('MFA_DISABLED', actor_id=user['id'], target_id=user['id'])
    clear_session_cookies(response)
    return MessageOut(message='MFA desativado. Todas as sessões foram encerradas.')


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
    doc = await db.password_reset_tokens.find_one(
        {'token': digest, 'used': False, 'expires_at': {'$gt': utcnow()}})
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
    if user.get('mfa_enabled') and not await verify_second_factor(user, input.mfa_code):
        raise HTTPException(401, 'Segundo fator inválido.')
    claimed = await db.password_reset_tokens.update_one(
        {'token': digest, 'used': False, 'expires_at': {'$gt': utcnow()}}, {'$set': {'used': True}}
    )
    if not claimed.modified_count:
        raise HTTPException(400, 'Token inválido ou já utilizado.')
    result = await db.users.update_one(
        {'id': user['id'], 'token_version': doc.get('token_version', 0)},
        {'$set': {'password_hash': password_hash}, '$inc': {'token_version': 1}},
    )
    if not result.modified_count:
        raise HTTPException(400, 'Token inválido ou expirado.')
    audit_event('PASSWORD_RESET', actor_id=user['id'], target_id=user['id'])
    return MessageOut(message="Senha redefinida com sucesso. Faça login novamente.")
