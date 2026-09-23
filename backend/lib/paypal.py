"""PayPal REST (Orders v2) client. Credentials live ONLY here, read from backend/.env.

While PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET are absent, `paypal_configured()` is False and the
checkout stays blocked upstream — no fake orders and no simulated charges are ever created.
"""

import os
from urllib.parse import quote

import httpx

SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
LIVE_BASE = "https://api-m.paypal.com"


def paypal_mode() -> str:
    return os.environ.get("PAYPAL_MODE", "sandbox").strip().lower()


def api_base() -> str:
    return LIVE_BASE if paypal_mode() == "live" else SANDBOX_BASE


def _credentials() -> tuple[str, str]:
    return (
        os.environ.get("PAYPAL_CLIENT_ID", "").strip(),
        os.environ.get("PAYPAL_CLIENT_SECRET", "").strip(),
    )


def paypal_configured() -> bool:
    client_id, secret = _credentials()
    return bool(client_id) and bool(secret) and os.getenv('PAYMENTS_PAUSED', 'true') == 'false' and paypal_mode() in ('sandbox', 'live')


async def _access_token(client: httpx.AsyncClient) -> str:
    client_id, secret = _credentials()
    resp = await client.post(
        f"{api_base()}/v1/oauth2/token",
        auth=(client_id, secret),
        data={"grant_type": "client_credentials"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


async def create_order(
    *, amount: float, reference: str, return_url: str, cancel_url: str, request_id: str
) -> tuple[str, str]:
    """Create a PayPal order server-side. Returns (paypal_order_id, approval_url)."""
    async with httpx.AsyncClient(timeout=30) as client:
        token = await _access_token(client)
        resp = await client.post(
            f"{api_base()}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", 'PayPal-Request-Id': request_id},
            json={
                "intent": "CAPTURE",
                "purchase_units": [
                    {
                        "reference_id": reference,
                        "custom_id": reference,
                        "description": f"MV Multimarcas — pedido {reference}",
                        "amount": {"currency_code": "BRL", "value": f"{amount:.2f}"},
                    }
                ],
                "application_context": {
                    "brand_name": "MV Multimarcas",
                    "locale": "pt-BR",
                    "user_action": "PAY_NOW",
                    "shipping_preference": "NO_SHIPPING",
                    "return_url": return_url,
                    "cancel_url": cancel_url,
                },
            },
        )
        resp.raise_for_status()
        data = resp.json()
    approval = next((link["href"] for link in data.get("links", []) if link.get("rel") == "payer-action"), None)
    if not approval:
        approval = next((link["href"] for link in data.get("links", []) if link.get("rel") == "approve"), "")
    return data["id"], approval


async def capture_order(paypal_order_id: str, *, request_id: str) -> dict:
    """Capture an approved PayPal order. Returns the raw capture payload."""
    async with httpx.AsyncClient(timeout=30) as client:
        token = await _access_token(client)
        resp = await client.post(
            f"{api_base()}/v2/checkout/orders/{quote(paypal_order_id, safe='')}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", 'PayPal-Request-Id': request_id},
        )
        resp.raise_for_status()
        return resp.json()


async def get_order(paypal_order_id: str) -> dict:
    """Read PayPal's current order state without creating or capturing a payment."""
    async with httpx.AsyncClient(timeout=30) as client:
        token = await _access_token(client)
        resp = await client.get(
            f"{api_base()}/v2/checkout/orders/{quote(paypal_order_id, safe='')}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()
