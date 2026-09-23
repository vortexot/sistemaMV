"""Real Mongo replica + ASGI; synthetic users, external HTTP replaced by a deny-all transport."""
import asyncio
import hashlib
import logging
import os
import uuid
import time
from datetime import timedelta
from io import BytesIO
from types import SimpleNamespace

import httpx
import jwt
import pyotp
import pytest
from cryptography.fernet import Fernet
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image
from lib import db as database_module, security, mfa, audit as audit_module
from lib.dates import utcnow
from routers import auth, admin, orders, files, favorites, catalog
from server import app

PASSWORD = 'Synthetic test password 42!'
TEST_HASH = security.hash_password(PASSWORD)


@pytest.fixture
async def secure(monkeypatch):
    url = os.getenv('SECURITY_TEST_MONGO_URL', '')
    assert url.startswith('mongodb://127.0.0.1:') and 'replicaSet=security_test' in url, 'Execute scripts/test-security.ps1'
    mongo = AsyncIOMotorClient(url, tz_aware=True, serverSelectionTimeoutMS=3000)
    name = 'security_test_' + uuid.uuid4().hex
    db = mongo[name]
    for module in (database_module, security, mfa, auth, admin, orders, files, favorites, catalog):
        monkeypatch.setattr(module, 'db', db)
    await database_module.ensure_indexes()
    monkeypatch.setenv('PUBLIC_ORIGIN', 'https://shop.test')
    monkeypatch.setenv('CORS_ORIGINS', 'https://shop.test')
    monkeypatch.setenv('PAYMENTS_PAUSED', 'false')
    monkeypatch.setenv('PAYPAL_CLIENT_ID', 'synthetic')
    monkeypatch.setenv('PAYPAL_CLIENT_SECRET', 'synthetic')
    monkeypatch.setenv('PAYPAL_MODE', 'sandbox')
    monkeypatch.setenv('GOOGLE_AUTH_ENABLED', 'false')
    monkeypatch.setenv('MFA_ENCRYPTION_KEY', 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=')
    monkeypatch.setenv('MFA_REQUIRED', 'false')
    monkeypatch.delenv('RESET_WEBHOOK_URL', raising=False)
    monkeypatch.delenv('RESET_WEBHOOK_TOKEN', raising=False)
    monkeypatch.delenv('RESET_WEBHOOK_ALLOWED_HOSTS', raising=False)
    delivery = []
    async def fake_network(transport, request):
        if request.url == 'https://reset.test/deliver':
            import json
            delivery.append(json.loads(request.content))
            return httpx.Response(200, json={'ok': True})
        raise AssertionError('External network is prohibited in security tests')
    monkeypatch.setattr(httpx.AsyncHTTPTransport, 'handle_async_request', fake_network)
    users = {}
    for role in ('admin', 'atendente', 'comprador'):
        user = {'id': role, 'name': 'Synthetic ' + role, 'email': role + '@example.com', 'role': role,
                'status': 'ativo', 'password_hash': TEST_HASH, 'token_version': 0, 'created_at': utcnow()}
        await db.users.insert_one(user)
        users[role] = user
    await db.products.insert_one({'id': 'product', 'name': 'Synthetic product', 'sku': 'SYN', 'brand': 'Test', 'category_id': 'cat',
                                 'price': 10.25, 'promo_price': None, 'stock': 5, 'active': True, 'archived': False, 'created_at': utcnow()})
    await db.categories.insert_one({
        'id': 'cat', 'name': 'Synthetic', 'slug': 'synthetic', 'description': '',
        'image_file_id': None, 'active': True, 'created_at': utcnow(),
    })
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='https://shop.test', headers={'Origin': 'https://shop.test'}) as api:
        def headers(role='comprador'):
            return {'Authorization': 'Bearer ' + security.create_access_token(users[role])}
        yield SimpleNamespace(api=api, db=db, users=users, headers=headers, delivery=delivery)
    assert name.startswith('security_test_')
    await mongo.drop_database(name)
    mongo.close()


def cart(qty=1, key=None):
    return {'idempotency_key': key or str(uuid.uuid4()), 'items': [{'product_id': 'product', 'qty': qty}]}


def test_mfa_encryption_key_rotation_window(monkeypatch):
    previous = Fernet.generate_key().decode()
    current = Fernet.generate_key().decode()
    monkeypatch.setenv('MFA_ENCRYPTION_KEY', previous)
    encrypted = mfa.encrypt_secret('synthetic-totp-seed')
    monkeypatch.setenv('MFA_ENCRYPTION_KEY', current)
    monkeypatch.setenv('MFA_ENCRYPTION_KEY_PREVIOUS', previous)
    assert mfa.decrypt_secret(encrypted) == 'synthetic-totp-seed'


async def test_anonymous_and_buyer_cannot_admin(secure):
    for path in ('customers', 'orders', 'products', 'stock', 'reports', 'indoor'):
        assert (await secure.api.get('/api/admin/' + path)).status_code == 401
        assert (await secure.api.get('/api/admin/' + path, headers=secure.headers())).status_code == 403
    assert (await secure.api.patch('/api/admin/customers/admin', json={'role': 'admin'}, headers=secure.headers())).status_code == 403


async def test_public_catalog_uses_minimal_response_models(secure):
    product = (await secure.api.get('/api/catalog/products')).json()[0]
    assert set(product) == {
        'id', 'name', 'sku', 'brand', 'category_name', 'category_slug', 'price',
        'promo_price', 'in_stock', 'sizes', 'colors', 'description', 'tag',
        'featured', 'image_file_id',
    }
    assert product['in_stock'] is True
    assert not {'stock', 'active', 'archived', 'category_id', 'created_at', 'updated_at'} & set(product)

    category = (await secure.api.get('/api/catalog/categories')).json()[0]
    assert set(category) == {'id', 'name', 'slug', 'description', 'image_file_id'}


async def test_reset_never_returns_secret_when_unconfigured(secure):
    for email in ('admin@example.com', 'missing@example.com'):
        response = await secure.api.post('/api/auth/forgot-password', json={'email': email})
        assert response.status_code == 503
        assert 'reset_token' not in response.json()
    assert await secure.db.password_reset_tokens.count_documents({}) == 0


async def test_reset_single_use_hash_expiry_revocation(secure, monkeypatch):
    monkeypatch.setenv('RESET_WEBHOOK_URL', 'https://reset.test/deliver')
    monkeypatch.setenv('RESET_WEBHOOK_TOKEN', 'synthetic-not-a-credential')
    monkeypatch.setenv('RESET_WEBHOOK_ALLOWED_HOSTS', 'reset.test')
    response = await secure.api.post('/api/auth/forgot-password', json={'email': 'comprador@example.com'})
    missing = await secure.api.post('/api/auth/forgot-password', json={'email': 'missing@example.com'})
    assert response.json() == missing.json()
    assert 'reset_token' not in response.json()
    token = secure.delivery[0]['token']
    doc = await secure.db.password_reset_tokens.find_one({})
    assert doc['token'] == hashlib.sha256(token.encode()).hexdigest() and token not in str(doc)
    old = secure.headers()
    results = await asyncio.gather(*[secure.api.post('/api/auth/reset-password', json={'token': token, 'new_password': PASSWORD}) for _ in range(2)])
    assert sorted(r.status_code for r in results) == [200, 400]
    assert (await secure.api.get('/api/auth/me', headers=old)).status_code == 401
    assert security.verify_password(PASSWORD, (await secure.db.users.find_one({'id': 'comprador'}))['password_hash'])
    await secure.db.password_reset_tokens.insert_one({'token': hashlib.sha256(b'x'*48).hexdigest(), 'user_id': 'admin', 'used': False, 'expires_at': utcnow()-timedelta(seconds=1)})
    assert (await secure.api.post('/api/auth/reset-password', json={'token': 'x'*48, 'new_password': PASSWORD})).status_code == 400


async def test_reset_webhook_rejects_non_allowlisted_destination(secure, monkeypatch):
    monkeypatch.setenv('RESET_WEBHOOK_URL', 'https://untrusted.test/deliver')
    monkeypatch.setenv('RESET_WEBHOOK_TOKEN', 'synthetic-not-a-credential')
    monkeypatch.setenv('RESET_WEBHOOK_ALLOWED_HOSTS', 'reset.test')
    response = await secure.api.post('/api/auth/forgot-password', json={'email': 'comprador@example.com'})
    assert response.status_code == 503
    assert not secure.delivery
    assert await secure.db.password_reset_tokens.count_documents({}) == 0


async def test_refresh_rotation_and_logout_revoke_copied_tokens(secure):
    user = secure.users['comprador']
    access, refresh = security.create_access_token(user), security.create_refresh_token(user)
    cookie = {'Cookie': f'gs_access_token={access}; gs_refresh_token={refresh}'}
    results = await asyncio.gather(*[secure.api.post('/api/auth/refresh', json={}, headers=cookie) for _ in range(2)])
    assert sorted(r.status_code for r in results) == [200, 401]
    assert (await secure.api.post('/api/auth/logout', json={}, headers=cookie)).status_code == 200
    secure.api.cookies.clear()
    assert (await secure.api.get('/api/auth/me', headers={'Authorization': 'Bearer '+access})).status_code == 401
    assert (await secure.api.post('/api/auth/refresh', json={}, headers=cookie)).status_code == 401


async def test_jwt_required_claims_issuer_and_server_role(secure):
    valid = security.create_access_token(secure.users['comprador'])
    payload = jwt.decode(valid, security.JWT_SECRET, algorithms=['HS256'], audience=security.JWT_AUDIENCE)
    for change in ({'iss': 'attacker'}, {'aud': 'other'}, {'type': 'refresh'}, {'exp': 1}):
        token = jwt.encode({**payload, **change}, security.JWT_SECRET, algorithm='HS256')
        assert (await secure.api.get('/api/auth/me', headers={'Authorization': 'Bearer '+token})).status_code == 401
    payload.pop('jti')
    assert security.decode_token(jwt.encode(payload, security.JWT_SECRET, algorithm='HS256'), 'access') is None
    token = security.create_access_token({**secure.users['comprador'], 'role': 'admin'})
    assert (await secure.api.get('/api/admin/customers', headers={'Authorization': 'Bearer '+token})).status_code == 403


async def test_role_change_revokes_previous_access(secure):
    old = secure.headers()
    response = await secure.api.patch('/api/admin/customers/comprador', headers=secure.headers('admin'), json={'role': 'atendente'})
    assert response.status_code == 200
    assert (await secure.api.get('/api/auth/me', headers=old)).status_code == 401


async def test_logout_revokes_bearer_sessions_too(secure):
    copied = secure.headers()
    assert (await secure.api.post('/api/auth/logout', json={}, headers=copied)).status_code == 200
    assert (await secure.api.get('/api/auth/me', headers=copied)).status_code == 401


async def test_login_failure_limit_does_not_lock_valid_credentials(secure):
    for _ in range(10):
        assert (await secure.api.post('/api/auth/login', json={'email': 'admin@example.com', 'password': 'wrong'})).status_code == 401
    assert (await secure.api.post('/api/auth/login', json={'email': 'admin@example.com', 'password': 'wrong'})).status_code == 429
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=('127.0.0.2', 4321)), base_url='https://shop.test') as other:
        assert (await other.post('/api/auth/login', json={'email': 'admin@example.com', 'password': PASSWORD})).status_code == 200


async def test_forwarding_headers_do_not_bypass_rate_limit(secure):
    for index in range(10):
        headers = {'X-Forwarded-For': f'198.51.100.{index}', 'X-Real-IP': f'203.0.113.{index}'}
        response = await secure.api.post(
            '/api/auth/login',
            json={'email': 'comprador@example.com', 'password': 'wrong'},
            headers=headers,
        )
        assert response.status_code == 401
    response = await secure.api.post(
        '/api/auth/login',
        json={'email': 'comprador@example.com', 'password': 'wrong'},
        headers={'X-Forwarded-For': '192.0.2.99'},
    )
    assert response.status_code == 429


async def test_retired_google_routes_are_not_exposed(secure):
    assert not security.verify_password('test', None)
    assert (await secure.api.get('/openapi.json')).status_code == 404
    assert (await secure.api.get('/api/auth/options')).status_code == 404
    assert (await secure.api.post('/api/auth/google/session', json={'session_id': 'fake'})).status_code == 404


async def test_csrf_body_limit_and_safe_error(secure):
    assert (await secure.api.post('/api/auth/logout', json={}, headers={'Origin': 'https://evil.test'})).status_code == 403
    assert (await secure.api.post('/api/auth/login', content='{}', headers={'Content-Type': 'text/plain'})).status_code == 415
    assert (await secure.api.post('/api/auth/login', content=b'x'*65537, headers={'Content-Type': 'application/json'})).status_code == 413
    response = await secure.api.post('/api/auth/register', json={'name': 'Tester', 'email': 'invalid', 'password': 'SENSITIVE-MARKER'})
    assert response.status_code == 422 and 'SENSITIVE-MARKER' not in response.text
    assert (await secure.api.post('/api/status', json={'client_name': 'x'})).status_code == 405
    response = await secure.api.get('/api/auth/me', headers=secure.headers())
    assert response.headers['cache-control'] == 'no-store' and response.headers['x-content-type-options'] == 'nosniff'


async def test_invalid_financial_fields_and_state(secure):
    for changes in ({'price': -1}, {'price': None}, {'promo_price': 20}, {'stock': -1}, {'isAdmin': True}):
        assert (await secure.api.patch('/api/admin/products/product', headers=secure.headers('admin'), json=changes)).status_code == 422
    created = (await secure.api.post('/api/orders', json=cart(), headers=secure.headers())).json()
    for status in ('aprovado', 'entregue', 'cancelado'):
        assert (await secure.api.patch('/api/admin/orders/'+created['id'], headers=secure.headers('admin'), json={'status': status})).status_code == 409


async def test_order_price_ownership_idempotency_and_conflict(secure):
    request = cart(2)
    response = await secure.api.post('/api/orders', json=request, headers=secure.headers())
    assert response.status_code == 200
    order = response.json()
    assert order['total'] == 20.50
    assert (await secure.api.post('/api/orders', json=request, headers=secure.headers())).json()['id'] == order['id']
    assert (await secure.api.post('/api/orders', json=cart(1, request['idempotency_key']), headers=secure.headers())).status_code == 409
    assert (await secure.db.products.find_one({'id': 'product'}))['stock'] == 3
    for path in ('/api/orders/'+order['id'],):
        assert (await secure.api.get(path, headers=secure.headers('atendente'))).status_code == 404
    for action in ('capture', 'cancel'):
        assert (await secure.api.post('/api/payments/paypal/'+action, json={'order_id': order['id']}, headers=secure.headers('atendente'))).status_code == 404
    assert (await secure.api.post('/api/orders', json={**cart(), 'total': .01}, headers=secure.headers())).status_code == 422


async def test_order_concurrency_and_repeated_cancel(secure):
    await secure.db.products.update_one({'id': 'product'}, {'$set': {'stock': 1}})
    replies = await asyncio.gather(*[secure.api.post('/api/orders', json=cart(), headers=secure.headers()) for _ in range(2)])
    assert sorted(r.status_code for r in replies) == [200, 409]
    order = next(r.json() for r in replies if r.status_code == 200)
    replies = await asyncio.gather(*[secure.api.post('/api/payments/paypal/cancel', json={'order_id': order['id']}, headers=secure.headers()) for _ in range(2)])
    assert [r.status_code for r in replies] == [200, 200]
    assert (await secure.db.products.find_one({'id': 'product'}))['stock'] == 1
    assert (await secure.api.post('/api/payments/paypal/capture', json={'order_id': order['id']}, headers=secure.headers())).status_code == 409


async def test_concurrent_same_key_and_transaction_rollback(secure):
    request = cart()
    replies = await asyncio.gather(*[secure.api.post('/api/orders', json=request, headers=secure.headers()) for _ in range(2)])
    assert [r.status_code for r in replies] == [200, 200]
    assert replies[0].json()['id'] == replies[1].json()['id']
    assert (await secure.db.products.find_one({'id': 'product'}))['stock'] == 4
    bad = cart()
    bad['items'].append({'product_id': 'z-missing', 'qty': 1})
    assert (await secure.api.post('/api/orders', json=bad, headers=secure.headers())).status_code == 409
    assert (await secure.db.products.find_one({'id': 'product'}))['stock'] == 4
    assert await secure.db.orders.count_documents({}) == 1


async def test_capture_amount_currency_and_pending_cancel(secure, monkeypatch):
    order = (await secure.api.post('/api/orders', json=cart(), headers=secure.headers())).json()
    await secure.db.orders.update_one({'id': order['id']}, {'$set': {'paypal_order_id': 'provider-test'}})
    calls = []
    async def capture(provider_id, *, request_id):
        calls.append(request_id)
        return {'id': provider_id, 'status': 'COMPLETED', 'purchase_units': [{'payments': {'captures': [{'status': 'COMPLETED', 'amount': {'currency_code': 'USD', 'value': '0.01'}}]}}]}
    monkeypatch.setattr(orders, 'paypal_capture', capture)
    for _ in range(2):
        assert (await secure.api.post('/api/payments/paypal/capture', json={'order_id': order['id']}, headers=secure.headers())).status_code == 409
    assert len(calls) == 1 and len(calls[0]) <= 38
    assert (await secure.api.post('/api/payments/paypal/cancel', json={'order_id': order['id']}, headers=secure.headers())).status_code == 409
    assert (await secure.db.orders.find_one({'id': order['id']}))['payment_status'] == 'revisao_necessaria'


async def test_payment_reconciliation_is_idempotent_and_never_moves_stock_twice(secure, monkeypatch):
    order = (await secure.api.post('/api/orders', json=cart(), headers=secure.headers())).json()
    await secure.db.orders.update_one({'id': order['id']}, {'$set': {
        'paypal_order_id': 'provider-test', 'payment_status': 'processando',
    }})
    calls = []

    async def provider_state(provider_id):
        calls.append(provider_id)
        return {
            'id': provider_id,
            'status': 'COMPLETED',
            'purchase_units': [{'payments': {'captures': [{
                'status': 'COMPLETED', 'amount': {'currency_code': 'BRL', 'value': '10.25'},
            }]}}],
        }

    monkeypatch.setattr(orders, 'paypal_get', provider_state)
    for _ in range(2):
        result = await secure.api.post('/api/payments/paypal/reconcile',
                                       json={'order_id': order['id']}, headers=secure.headers())
        assert result.status_code == 200 and result.json()['payment_status'] == 'pago'
    assert calls == ['provider-test']
    assert (await secure.db.products.find_one({'id': 'product'}))['stock'] == 4


async def test_payment_reconciliation_marks_ambiguous_state_for_review(secure, monkeypatch):
    order = (await secure.api.post('/api/orders', json=cart(), headers=secure.headers())).json()
    await secure.db.orders.update_one({'id': order['id']}, {'$set': {
        'paypal_order_id': 'provider-test', 'payment_status': 'processando',
    }})

    async def ambiguous(_provider_id):
        return {'id': 'different-provider-id', 'status': 'COMPLETED', 'purchase_units': []}

    monkeypatch.setattr(orders, 'paypal_get', ambiguous)
    result = await secure.api.post('/api/payments/paypal/reconcile',
                                   json={'order_id': order['id']}, headers=secure.headers())
    assert result.status_code == 200 and result.json()['payment_status'] == 'revisao_necessaria'
    assert (await secure.api.post('/api/payments/paypal/cancel',
                                  json={'order_id': order['id']}, headers=secure.headers())).status_code == 409


def test_security_log_redaction(caplog):
    caplog.set_level(logging.INFO)
    audit_module.audit_event('TEST_EVENT', details={
        'password': 'password-marker',
        'Authorization': 'Bearer authorization-marker',
        'mfa_secret': 'totp-marker',
        'recovery_code': 'recovery-marker',
        'connection_string': 'mongodb://connection-marker',
        'safe': 'visible',
    })
    output = '\n'.join(record.getMessage() for record in caplog.records)
    assert 'visible' in output and '[REDACTED]' in output
    for marker in ('password-marker', 'authorization-marker', 'totp-marker', 'recovery-marker', 'connection-marker'):
        assert marker not in output


async def test_emergency_pause(secure, monkeypatch):
    monkeypatch.setenv('PAYMENTS_PAUSED', 'true')
    assert (await secure.api.post('/api/orders', json=cart(), headers=secure.headers())).status_code == 503
    assert not (await secure.api.get('/api/payments/status')).json()['paypal_configured']
    assert await secure.db.orders.count_documents({}) == 0


async def test_login_and_absolute_session_deadline(secure, monkeypatch):
    monkeypatch.setenv('COOKIE_SECURE', 'true')
    response = await secure.api.post('/api/auth/login', json={'email': 'admin@example.com', 'password': PASSWORD})
    assert response.status_code == 200
    for cookie in response.headers.get_list('set-cookie'):
        assert 'HttpOnly' in cookie and 'Secure' in cookie and 'SameSite=lax' in cookie
    assert (await secure.api.get('/api/admin/indoor')).status_code == 200
    original = int((utcnow() - timedelta(hours=7)).timestamp())
    token = security.create_refresh_token(secure.users['admin'], original)
    response = await secure.api.post('/api/auth/refresh', json={}, headers={'Cookie': f'gs_refresh_token={token}'})
    assert response.status_code == 200
    rotated = security.decode_token(secure.api.cookies.get('gs_refresh_token'), 'refresh')
    assert rotated['auth_time'] == original and rotated['exp'] <= original + 8 * 3600
    expired = security.create_refresh_token(secure.users['admin'], int((utcnow()-timedelta(hours=9)).timestamp()))
    assert security.decode_token(expired, 'refresh') is None


async def test_staff_mfa_setup_login_recovery_and_password_reset(secure, monkeypatch):
    headers = secure.headers('admin')
    setup = await secure.api.post('/api/auth/mfa/setup', headers=headers, json={'current_password': PASSWORD})
    assert setup.status_code == 200 and setup.json()['secret'] not in str(await secure.db.users.find_one({'id': 'admin'}))
    secret = setup.json()['secret']
    confirm = await secure.api.post('/api/auth/mfa/confirm', headers=headers, json={
        'current_password': PASSWORD, 'code': pyotp.TOTP(secret).now(),
    })
    assert confirm.status_code == 200 and len(confirm.json()['recovery_codes']) == 10
    assert (await secure.api.post('/api/auth/login', json={'email': 'admin@example.com', 'password': PASSWORD})).status_code == 401
    login = await secure.api.post('/api/auth/login', json={
        'email': 'admin@example.com', 'password': PASSWORD, 'mfa_code': pyotp.TOTP(secret).now(),
    })
    assert login.status_code == 200
    recovery = confirm.json()['recovery_codes'][0]
    secure.api.cookies.clear()
    assert (await secure.api.post('/api/auth/login', json={
        'email': 'admin@example.com', 'password': PASSWORD, 'mfa_code': recovery,
    })).status_code == 200
    secure.api.cookies.clear()
    assert (await secure.api.post('/api/auth/login', json={
        'email': 'admin@example.com', 'password': PASSWORD, 'mfa_code': recovery,
    })).status_code == 401

    monkeypatch.setenv('RESET_WEBHOOK_URL', 'https://reset.test/deliver')
    monkeypatch.setenv('RESET_WEBHOOK_TOKEN', 'synthetic-not-a-credential')
    monkeypatch.setenv('RESET_WEBHOOK_ALLOWED_HOSTS', 'reset.test')
    await secure.api.post('/api/auth/forgot-password', json={'email': 'admin@example.com'})
    token = secure.delivery[-1]['token']
    reset_recovery_code = confirm.json()['recovery_codes'][1]
    assert (await secure.api.post('/api/auth/reset-password', json={
        'token': token, 'new_password': PASSWORD,
    })).status_code == 401
    assert (await secure.api.post('/api/auth/reset-password', json={
        'token': token, 'new_password': PASSWORD, 'mfa_code': reset_recovery_code,
    })).status_code == 200
    after_reset = await secure.db.users.find_one({'id': 'admin'})
    assert after_reset['mfa_enabled'] is True and after_reset['mfa_secret']


async def test_recovery_codes_can_be_regenerated_once_and_old_codes_are_invalid(secure):
    secret = mfa.new_secret()
    old_code = mfa.new_recovery_codes()[0]
    await secure.db.users.update_one({'id': 'admin'}, {'$set': {
        'mfa_enabled': True,
        'mfa_secret': mfa.encrypt_secret(secret),
        'mfa_recovery_codes': [mfa.recovery_digest('admin', old_code)],
    }})
    user = {**secure.users['admin'], 'mfa_enabled': True}
    headers = {'Authorization': 'Bearer ' + security.create_access_token(user, mfa_verified=True)}
    response = await secure.api.post('/api/auth/mfa/recovery-codes/regenerate', headers=headers, json={})
    assert response.status_code == 200 and len(response.json()['recovery_codes']) == 10
    new_code = response.json()['recovery_codes'][0]
    stored = await secure.db.users.find_one({'id': 'admin'}, {'_id': 0})
    assert old_code not in str(stored) and new_code not in str(stored)
    secure.api.cookies.clear()
    assert (await secure.api.post('/api/auth/login', json={
        'email': 'admin@example.com', 'password': PASSWORD, 'mfa_code': old_code,
    })).status_code == 401
    assert (await secure.api.post('/api/auth/login', json={
        'email': 'admin@example.com', 'password': PASSWORD, 'mfa_code': new_code,
    })).status_code == 200
    secure.api.cookies.clear()
    assert (await secure.api.post('/api/auth/login', json={
        'email': 'admin@example.com', 'password': PASSWORD, 'mfa_code': new_code,
    })).status_code == 401


async def test_admin_mfa_recovery_requires_other_stepped_up_admin_and_revokes_sessions(secure):
    admin_secret, target_secret = mfa.new_secret(), mfa.new_secret()
    await secure.db.users.update_one({'id': 'admin'}, {'$set': {
        'mfa_enabled': True, 'mfa_secret': mfa.encrypt_secret(admin_secret), 'mfa_recovery_codes': [],
    }})
    await secure.db.users.update_one({'id': 'atendente'}, {'$set': {
        'role': 'admin', 'mfa_enabled': True, 'mfa_secret': mfa.encrypt_secret(target_secret),
        'mfa_recovery_codes': [],
    }})
    admin_user = {**secure.users['admin'], 'mfa_enabled': True}
    target_user = {**secure.users['atendente'], 'role': 'admin', 'mfa_enabled': True}
    admin_headers = {'Authorization': 'Bearer ' + security.create_access_token(admin_user, mfa_verified=True)}
    old_target_headers = {'Authorization': 'Bearer ' + security.create_access_token(target_user, mfa_verified=True)}

    assert (await secure.api.post('/api/auth/mfa/admin-recovery/request/atendente',
                                  headers=secure.headers(), json={})).status_code == 403
    stale_token = security.create_access_token(admin_user, reauthenticated_at=int(time.time()) - 601,
                                                mfa_verified=True)
    assert (await secure.api.post('/api/auth/mfa/admin-recovery/request/atendente',
                                  headers={'Authorization': 'Bearer ' + stale_token}, json={})).status_code == 403
    assert (await secure.api.post('/api/auth/mfa/admin-recovery/request/admin',
                                  headers=admin_headers, json={})).status_code == 400

    requested = await secure.api.post('/api/auth/mfa/admin-recovery/request/atendente', headers=admin_headers, json={})
    assert requested.status_code == 200
    recovery_token = requested.json()['recovery_token']
    stored = await secure.db.users.find_one({'id': 'atendente'}, {'_id': 0})
    assert recovery_token not in str(stored) and stored['mfa_enabled'] is True
    assert (await secure.api.get('/api/auth/me', headers=old_target_headers)).status_code == 401

    setup_payload = {'email': 'atendente@example.com', 'password': PASSWORD, 'recovery_token': recovery_token}
    setup = await secure.api.post('/api/auth/mfa/admin-recovery/setup', json=setup_payload)
    assert setup.status_code == 200
    new_secret = setup.json()['secret']
    complete = await secure.api.post('/api/auth/mfa/admin-recovery/complete', json={
        **setup_payload, 'code': pyotp.TOTP(new_secret).now(),
    })
    assert complete.status_code == 200 and len(complete.json()['recovery_codes']) == 10
    assert (await secure.api.post('/api/auth/mfa/admin-recovery/complete', json={
        **setup_payload, 'code': pyotp.TOTP(new_secret).at(time.time() + 30),
    })).status_code in {401, 409}
    assert (await secure.api.post('/api/auth/login', json={
        'email': 'atendente@example.com', 'password': PASSWORD, 'mfa_code': pyotp.TOTP(target_secret).now(),
    })).status_code == 401
    assert (await secure.api.post('/api/auth/login', json={
        'email': 'atendente@example.com', 'password': PASSWORD, 'mfa_code': pyotp.TOTP(new_secret).now(),
    })).status_code == 200


async def test_recent_auth_and_password_change_revoke_sessions(secure):
    old = secure.headers('admin')
    payload = jwt.decode(old['Authorization'][7:], security.JWT_SECRET, algorithms=['HS256'],
                         audience=security.JWT_AUDIENCE)
    payload['reauth_at'] -= 601
    stale = {'Authorization': 'Bearer ' + jwt.encode(payload, security.JWT_SECRET, algorithm='HS256')}
    assert (await secure.api.patch('/api/admin/products/product', headers=stale, json={'stock': 4})).status_code == 403
    reauth = await secure.api.post('/api/auth/reauthenticate', headers=stale, json={'password': PASSWORD})
    assert reauth.status_code == 200
    assert (await secure.api.patch('/api/admin/products/product', json={'stock': 4})).status_code == 200
    changed = await secure.api.post('/api/auth/change-password', headers=old, json={
        'current_password': PASSWORD, 'new_password': 'Another synthetic password 42!',
    })
    assert changed.status_code == 200
    assert (await secure.api.get('/api/auth/me', headers=old)).status_code == 401


async def test_attendant_cannot_read_customers_reports_or_admin_summary(secure):
    for path in ('customers', 'reports', 'dashboard'):
        assert (await secure.api.get('/api/admin/' + path, headers=secure.headers('atendente'))).status_code == 403


async def test_successful_capture_replay_and_delivery_sequence(secure, monkeypatch):
    order = (await secure.api.post('/api/orders', json=cart(), headers=secure.headers())).json()
    await secure.db.orders.update_one({'id': order['id']}, {'$set': {'paypal_order_id': 'provider-test'}})
    calls = []
    async def capture(provider_id, *, request_id):
        calls.append(request_id)
        return {'id': provider_id, 'status': 'COMPLETED', 'purchase_units': [{'payments': {'captures': [{'status': 'COMPLETED', 'amount': {'currency_code': 'BRL', 'value': '10.25'}}]}}]}
    monkeypatch.setattr(orders, 'paypal_capture', capture)
    for _ in range(2):
        result = await secure.api.post('/api/payments/paypal/capture', json={'order_id': order['id']}, headers=secure.headers())
        assert result.status_code == 200 and result.json()['payment_status'] == 'pago'
    assert len(calls) == 1
    assert (await secure.db.products.find_one({'id': 'product'}))['stock'] == 4
    for state, expected in [('entregue', 409), ('preparando', 200), ('aprovado', 409), ('enviado', 200), ('em_transito', 200), ('entregue', 200)]:
        response = await secure.api.patch('/api/admin/orders/'+order['id'], json={'status': state}, headers=secure.headers('admin'))
        assert response.status_code == expected


async def test_untrusted_payment_redirect_is_rejected(secure, monkeypatch):
    order = (await secure.api.post('/api/orders', json=cart(), headers=secure.headers())).json()
    async def forbidden(**kwargs):
        raise AssertionError('Provider must not be called for invalid redirects')
    monkeypatch.setattr(orders, 'paypal_create', forbidden)
    response = await secure.api.post('/api/payments/paypal/create', headers=secure.headers(), json={
        'order_id': order['id'], 'return_url': 'https://attacker.test/', 'cancel_url': 'https://shop.test/checkout'})
    assert response.status_code == 422


async def test_pending_order_limit_holds_under_concurrency(secure):
    await secure.db.products.update_one({'id': 'product'}, {'$set': {'stock': 20}})
    responses = await asyncio.gather(*[secure.api.post('/api/orders', json=cart(), headers=secure.headers()) for _ in range(7)])
    assert sorted(r.status_code for r in responses) == [200]*5 + [409]*2
    assert await secure.db.orders.count_documents({}) == 5
    assert (await secure.db.products.find_one({'id': 'product'}))['stock'] == 15


async def test_false_webhook_has_no_handler(secure):
    assert (await secure.api.post('/api/payments/paypal/webhook', json={'status': 'COMPLETED'})).status_code == 404


async def test_storage_path_cannot_escape(secure, tmp_path, monkeypatch):
    root = tmp_path / 'uploads'
    root.mkdir()
    outside = tmp_path / 'private.txt'
    outside.write_text('SENSITIVE-MARKER')
    monkeypatch.setattr(files, 'STORAGE_DIR', root)
    await secure.db.files.insert_one({'id': 'outside', 'is_deleted': False, 'access': 'public_asset', 'storage_path': str(outside), 'content_type': 'image/png'})
    response = await secure.api.get('/api/files/outside')
    assert response.status_code == 404 and 'SENSITIVE-MARKER' not in response.text


async def test_gridfs_upload_persists_serves_and_deduplicates(secure, monkeypatch):
    monkeypatch.setenv('STORAGE_BACKEND', 'gridfs')
    image = BytesIO()
    Image.new('RGB', (32, 18), color=(18, 52, 86)).save(image, format='PNG')
    data = image.getvalue()

    first = await secure.api.post(
        '/api/files/upload',
        files={'file': ('staging.png', data, 'image/png')},
        headers=secure.headers('admin'),
    )
    second = await secure.api.post(
        '/api/files/upload',
        files={'file': ('same-content.png', data, 'image/png')},
        headers=secure.headers('admin'),
    )

    assert first.status_code == 200 and second.status_code == 200
    assert second.json()['id'] == first.json()['id']
    doc = await secure.db.files.find_one({'id': first.json()['id']}, {'_id': 0})
    assert doc['storage_backend'] == 'gridfs'
    assert doc['storage_key'] == doc['id']
    assert doc['storage_path'] == f"gridfs://uploads/{doc['id']}"
    assert await secure.db['uploads.files'].count_documents({}) == 1

    response = await secure.api.get(f"/api/files/{doc['id']}")
    assert response.status_code == 200 and response.content == data
    assert response.headers['content-type'] == 'image/png'
    assert response.headers['cache-control'] == 'public, max-age=31536000, immutable'
    assert response.headers['x-content-type-options'] == 'nosniff'


async def test_private_file_is_never_served_by_public_asset_route(secure, tmp_path, monkeypatch):
    root = tmp_path / 'uploads'
    root.mkdir()
    private = root / 'private.png'
    private.write_bytes(b'private-file-marker')
    monkeypatch.setattr(files, 'STORAGE_DIR', root)
    await secure.db.files.insert_one({
        'id': 'private',
        'is_deleted': False,
        'access': 'private_file',
        'storage_path': str(private),
        'content_type': 'image/png',
    })
    response = await secure.api.get('/api/files/private')
    assert response.status_code == 404 and 'private-file-marker' not in response.text


async def test_unclassified_legacy_file_is_not_public(secure, tmp_path, monkeypatch):
    root = tmp_path / 'uploads'
    root.mkdir()
    legacy = root / 'legacy.png'
    legacy.write_bytes(b'legacy-file-marker')
    monkeypatch.setattr(files, 'STORAGE_DIR', root)
    await secure.db.files.insert_one({
        'id': 'legacy',
        'is_deleted': False,
        'storage_path': str(legacy),
        'content_type': 'image/png',
    })
    response = await secure.api.get('/api/files/legacy')
    assert response.status_code == 404 and 'legacy-file-marker' not in response.text
