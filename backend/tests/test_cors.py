import importlib

import httpx
import pytest


def configured_app(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'staging')
    monkeypatch.setenv('PUBLIC_ORIGIN', 'https://shop.test')
    monkeypatch.setenv('CORS_ORIGINS', 'https://shop.test')
    import server
    return importlib.reload(server).app


@pytest.mark.asyncio
async def test_cors_allows_only_the_configured_origin(monkeypatch):
    transport = httpx.ASGITransport(app=configured_app(monkeypatch))
    async with httpx.AsyncClient(transport=transport, base_url='https://api.test') as client:
        trusted = await client.options(
            '/api/auth/login',
            headers={
                'Origin': 'https://shop.test',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            },
        )
        hostile = await client.options(
            '/api/auth/login',
            headers={
                'Origin': 'https://evil.example',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            },
        )

    assert trusted.status_code == 200
    assert trusted.headers['access-control-allow-origin'] == 'https://shop.test'
    assert hostile.status_code == 400
    assert 'access-control-allow-origin' not in hostile.headers


@pytest.mark.asyncio
async def test_cors_blocks_cross_site_writes_before_authentication(monkeypatch):
    transport = httpx.ASGITransport(app=configured_app(monkeypatch))
    async with httpx.AsyncClient(transport=transport, base_url='https://api.test') as client:
        response = await client.post(
            '/api/auth/login',
            headers={'Origin': 'https://evil.example', 'Content-Type': 'application/json'},
            json={'email': 'attacker@example.com', 'password': 'invalid'},
        )

    assert response.status_code == 403
    assert response.json()['detail'] == 'Origem nao permitida.'
