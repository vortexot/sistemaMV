"""Local delivery quotes based on postal-code coordinates."""

import math
import re
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
LOCAL_CITIES = {"valparaiso de goias", "luziania"}


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
    }


async def shipping_quote(postal_code: str) -> dict:
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

    coordinates = address.get("location", {}).get("coordinates", {})
    try:
        latitude = float(coordinates["latitude"])
        longitude = float(coordinates["longitude"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Esse CEP não possui localização suficiente para calcular a entrega.") from error
    if not latitude and not longitude:
        raise ValueError("Esse CEP não possui localização suficiente para calcular a entrega.")

    quote = (
        motoboy_quote(latitude, longitude)
        if _plain(address.get("city", "")) in LOCAL_CITIES
        else {
            "method": "correios",
            "available": False,
            "fee": None,
            "distance_km": None,
            "origin_store": None,
        }
    )
    return {
        **quote,
        "postal_code": postal_code,
        "street": address.get("street", ""),
        "neighborhood": address.get("neighborhood", ""),
        "city": address.get("city", ""),
        "state": address.get("state", ""),
    }
