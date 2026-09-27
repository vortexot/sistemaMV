from decimal import Decimal

from lib.pix import _crc16, normalize_phone_key, pix_payload


def test_phone_key_is_normalized_to_brazilian_e164():
    assert normalize_phone_key("61 99999-9999") == "+5561999999999"
    assert normalize_phone_key("+55 61 99999-9999") == "+5561999999999"


def test_static_pix_payload_contains_amount_txid_and_valid_crc(monkeypatch):
    monkeypatch.setenv("PIX_KEY_TYPE", "phone")
    monkeypatch.setenv("PIX_RECEIVER_NAME", "MV Multimarcas")
    monkeypatch.setenv("PIX_RECEIVER_CITY", "Valparaíso")
    payload = pix_payload(key="61999999999", amount=Decimal("49.90"), txid="MV-abc-123")
    assert "0014br.gov.bcb.pix" in payload
    assert "+5561999999999" in payload
    assert "540549.90" in payload
    assert "5906" not in payload
    assert "MVABC123" in payload
    assert payload.endswith("6304" + payload[-4:])
    assert len(payload[-4:]) == 4 and all(char in "0123456789ABCDEF" for char in payload[-4:])


def test_crc_matches_banco_central_br_code_example():
    payload = (
        "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000"
        "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304"
    )
    assert _crc16(payload) == "1D3D"
