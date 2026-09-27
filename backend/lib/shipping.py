"""Delivery quotes for the DF region and the official Correios API."""

import math
import os
import re
import time
import unicodedata
from decimal import Decimal, ROUND_HALF_UP

import httpx


STORES = (
    {
        "name": "Valparaíso de Goiás",
        "postal_code": "72871059",
        "latitude": -16.06583,
        "longitude": -47.97861,
    },
    {
        "name": "Luziânia",
        "postal_code": "72803010",
        "latitude": -16.25250,
        "longitude": -47.95028,
    },
)
REGIONAL_CITIES = {
    "aguas lindas de goias",
    "cidade ocidental",
    "cocalzinho de goias",
    "cristalina",
    "formosa",
    "luziania",
    "novo gama",
    "padre bernardo",
    "planaltina",
    "santo antonio do descoberto",
    "valparaiso de goias",
}
CORREIOS_SERVICE_NAMES = {"03298": "PAC", "03220": "SEDEX"}
_correios_token_value = ""
_correios_token_expires_at = 0.0


def _plain(value: str) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", value).casefold()
        if not unicodedata.combining(character)
    ).strip()


def _distance_km(latitude: float, longitude: float, store: dict) -> float:
    radius = 6371.0088
    lat1, lat2 = math.radians(latitude), math.radians(store["latitude"])
    delta_lat = lat2 - lat1
    delta_lon = math.radians(store["longitude"] - longitude)
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return radius * 2 * math.asin(math.sqrt(value))


def is_regional_delivery(city: str, state: str) -> bool:
    state = state.strip().upper()
    return state == "DF" or (state == "GO" and _plain(city) in REGIONAL_CITIES)


def motoboy_quote(latitude: float, longitude: float) -> dict:
    store, distance = min(
        ((store, _distance_km(latitude, longitude, store)) for store in STORES),
        key=lambda item: item[1],
    )
    fee = min(Decimal("50"), Decimal("9") + Decimal("4") * Decimal(str(distance)))
    return {
        "method": "motoboy",
        "available": True,
        "fee": float(fee.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "distance_km": round(distance, 1),
        "origin_store": store["name"],
        "service_code": None,
        "service_name": "Motoboy",
        "delivery_days": None,
    }


def correios_configured() -> bool:
    if os.getenv("CORREIOS_ENABLED", "false").lower() != "true":
        return False
    if os.getenv("CORREIOS_ACCESS_TOKEN", "").strip():
        return True
    return all(os.getenv(key, "").strip() for key in (
        "CORREIOS_USERNAME",
        "CORREIOS_API_CODE",
        "CORREIOS_POSTING_CARD",
        "CORREIOS_CONTRACT",
        "CORREIOS_DR",
    ))


def _correios_base(service: str) -> str:
    host = "apihom.correios.com.br" if os.getenv("CORREIOS_ENV") == "homologation" else "api.correios.com.br"
    return f"https://{host}/{service}/v1"


async def _correios_token(client: httpx.AsyncClient) -> str:
    global _correios_token_value, _correios_token_expires_at
    delegated = os.getenv("CORREIOS_ACCESS_TOKEN", "").strip()
    if delegated:
        return delegated
    if _correios_token_value and time.time() < _correios_token_expires_at:
        return _correios_token_value
    response = await client.post(
        f"{_correios_base('token')}/autentica/cartaopostagem",
        auth=(os.environ["CORREIOS_USERNAME"], os.environ["CORREIOS_API_CODE"]),
        json={
            "numero": os.environ["CORREIOS_POSTING_CARD"],
            "contrato": os.environ["CORREIOS_CONTRACT"],
            "dr": int(os.environ["CORREIOS_DR"]),
        },
    )
    response.raise_for_status()
    _correios_token_value = response.json()["token"]
    _correios_token_expires_at = time.time() + 50 * 60
    return _correios_token_value


def _money(value: str) -> Decimal:
    value = str(value).strip()
    return Decimal(value.replace(".", "").replace(",", ".") if "," in value else value)


async def correios_quote(postal_code: str, quantity: int = 1) -> dict:
    if not correios_configured():
        return {
            "method": "correios", "available": False, "fee": None,
            "distance_km": None, "origin_store": None, "service_code": None,
            "service_name": None, "delivery_days": None,
        }

    service_codes = [code.strip() for code in os.getenv("CORREIOS_SERVICE_CODES", "03298,03220").split(",") if code.strip()]
    origin = re.sub(r"\D", "", os.getenv("CORREIOS_ORIGIN_POSTAL_CODE", STORES[0]["postal_code"]))
    weight = max(1, int(os.getenv("CORREIOS_ITEM_WEIGHT_GRAMS", "500"))) * quantity
    common = {
        "cepOrigem": origin,
        "cepDestino": postal_code,
        "psObjeto": str(weight),
        "tpObjeto": "2",
        "comprimento": os.getenv("CORREIOS_PACKAGE_LENGTH_CM", "30"),
        "largura": os.getenv("CORREIOS_PACKAGE_WIDTH_CM", "25"),
        "altura": os.getenv("CORREIOS_PACKAGE_HEIGHT_CM", "10"),
    }
    if os.getenv("CORREIOS_CONTRACT", "").strip():
        common["nuContrato"] = os.environ["CORREIOS_CONTRACT"]
    if os.getenv("CORREIOS_DR", "").strip():
        common["nuDR"] = int(os.environ["CORREIOS_DR"])
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token = await _correios_token(client)
            headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
            price_response = await client.post(
                f"{_correios_base('preco')}/nacional",
                headers=headers,
                json={
                    "idLote": "mv",
                    "parametrosProduto": [
                        {**common, "coProduto": code, "nuRequisicao": str(index)}
                        for index, code in enumerate(service_codes, 1)
                    ],
                },
            )
            price_response.raise_for_status()
            prices = [item for item in price_response.json() if item.get("pcFinal") and not item.get("txErro")]
            if not prices:
                raise RuntimeError("Os Correios não atendem esse CEP com os serviços configurados.")
            best = min(prices, key=lambda item: _money(item["pcFinal"]))
            code = best["coProduto"]
            deadline_response = await client.get(
                f"{_correios_base('prazo')}/nacional/{code}",
                headers=headers,
                params={"cepOrigem": origin, "cepDestino": postal_code},
            )
            deadline_response.raise_for_status()
            deadline = deadline_response.json()
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as error:
        raise RuntimeError("Não foi possível calcular o frete dos Correios agora.") from error

    return {
        "method": "correios",
        "available": True,
        "fee": float(_money(best["pcFinal"]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "distance_km": None,
        "origin_store": None,
        "service_code": code,
        "service_name": CORREIOS_SERVICE_NAMES.get(code, f"Serviço {code}"),
        "delivery_days": int(deadline["prazoEntrega"]) if deadline.get("prazoEntrega") is not None else None,
    }


async def shipping_quote(postal_code: str, quantity: int = 1) -> dict:
    postal_code = re.sub(r"\D", "", postal_code)
    if len(postal_code) != 8:
        raise ValueError("Informe um CEP válido com 8 números.")

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(f"https://brasilapi.com.br/api/cep/v2/{postal_code}")
            response.raise_for_status()
            address = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise RuntimeError("Não foi possível consultar esse CEP agora.") from error

    if is_regional_delivery(address.get("city", ""), address.get("state", "")):
        coordinates = address.get("location", {}).get("coordinates", {})
        try:
            latitude = float(coordinates["latitude"])
            longitude = float(coordinates["longitude"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("Esse CEP não possui localização suficiente para calcular a entrega.") from error
        if not latitude and not longitude:
            raise ValueError("Esse CEP não possui localização suficiente para calcular a entrega.")
        quote = motoboy_quote(latitude, longitude)
    else:
        quote = await correios_quote(postal_code, quantity)
    return {
        **quote,
        "postal_code": postal_code,
        "street": address.get("street", ""),
        "neighborhood": address.get("neighborhood", ""),
        "city": address.get("city", ""),
        "state": address.get("state", ""),
    }
