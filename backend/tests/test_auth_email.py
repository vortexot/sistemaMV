import httpx
import pytest

from lib import auth_email


@pytest.mark.asyncio
async def test_resend_delivery_uses_server_secret_and_idempotency(monkeypatch):
    sent = {}

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, *, headers, json):
            sent.update(url=url, headers=headers, json=json)
            return httpx.Response(
                200,
                request=httpx.Request("POST", url),
                json={"id": "synthetic-message"},
            )

    monkeypatch.setenv("AUTH_EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_" + "a" * 32)
    monkeypatch.setenv("AUTH_EMAIL_FROM", "MV Multimarcas <contato@loja.example>")
    monkeypatch.setenv("PUBLIC_ORIGIN", "https://loja.example")
    monkeypatch.setattr(auth_email.httpx, "AsyncClient", lambda **_: Client())

    delivered = await auth_email.deliver(
        "verify_email",
        "buyer@example.com",
        token="synthetic-token",
        expires_in_seconds=1800,
    )

    assert delivered is True
    assert sent["url"] == "https://api.resend.com/emails"
    assert sent["headers"]["Authorization"].startswith("Bearer re_")
    assert sent["headers"]["Idempotency-Key"].startswith("auth/")
    assert sent["json"]["to"] == ["buyer@example.com"]
    assert "synthetic-token" in sent["json"]["text"]
    assert "synthetic-token" in sent["json"]["html"]


@pytest.mark.asyncio
async def test_resend_delivery_fails_closed(monkeypatch):
    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, *_args, **_kwargs):
            raise httpx.ConnectError("synthetic failure")

    monkeypatch.setenv("AUTH_EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_" + "a" * 32)
    monkeypatch.setenv("AUTH_EMAIL_FROM", "MV Multimarcas <contato@loja.example>")
    monkeypatch.setattr(auth_email.httpx, "AsyncClient", lambda **_: Client())

    assert await auth_email.deliver(
        "reset_password", "buyer@example.com", token="synthetic-token", expires_in_seconds=1800
    ) is False
