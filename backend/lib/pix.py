"""BR Code payload generation for manual static Pix charges."""

import os
import re
import unicodedata
from decimal import Decimal, ROUND_HALF_UP


def _field(identifier: str, value: str) -> str:
    encoded = value.encode("utf-8")
    if len(encoded) > 99:
        raise ValueError(f"Campo Pix {identifier} excede o limite do BR Code.")
    return f"{identifier}{len(encoded):02d}{value}"


def _ascii(value: str, limit: int) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^A-Za-z0-9 $%*+\-./:]", " ", value).strip().upper()
    return re.sub(r"\s+", " ", value)[:limit]


def normalize_phone_key(value: str) -> str:
    value = value.strip()
    if value.startswith("+"):
        digits = re.sub(r"\D", "", value)
        return f"+{digits}"
    digits = re.sub(r"\D", "", value)
    if len(digits) in (10, 11):
        return f"+55{digits}"
    return value


def _crc16(payload: str) -> str:
    crc = 0xFFFF
    for byte in payload.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def pix_payload(*, key: str, amount: Decimal, txid: str) -> str:
    if os.getenv("PIX_KEY_TYPE", "phone").lower() == "phone":
        key = normalize_phone_key(key)
    if not key or len(key.encode("utf-8")) > 77:
        raise ValueError("Chave Pix inválida para QR Code.")
    receiver = _ascii(os.getenv("PIX_RECEIVER_NAME", "MV MULTIMARCAS"), 25)
    city = _ascii(os.getenv("PIX_RECEIVER_CITY", "VALPARAISO"), 15)
    clean_txid = re.sub(r"[^A-Za-z0-9]", "", txid).upper()[:25] or "***"
    charge = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if charge <= 0 or charge > Decimal("9999999999.99"):
        raise ValueError("Valor inválido para QR Code Pix.")

    merchant_account = _field("00", "br.gov.bcb.pix") + _field("01", key)
    additional = _field("05", clean_txid)
    payload = "".join((
        _field("00", "01"),
        _field("26", merchant_account),
        _field("52", "0000"),
        _field("53", "986"),
        _field("54", f"{charge:.2f}"),
        _field("58", "BR"),
        _field("59", receiver),
        _field("60", city),
        _field("62", additional),
        "6304",
    ))
    return payload + _crc16(payload)
