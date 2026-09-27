import json

import httpx
import pytest

import lib.shipping as shipping
from lib.shipping import STORES, _money, correios_quote, is_regional_delivery, motoboy_quote


def test_motoboy_uses_nearest_store_and_caps_fee():
    valparaiso = STORES[0]
    quote = motoboy_quote(valparaiso['latitude'], valparaiso['longitude'])
    assert quote == {
        'method': 'motoboy',
        'available': True,
        'fee': 9.0,
        'distance_km': 0.0,
        'origin_store': 'Valparaíso de Goiás',
        'service_code': None,
        'service_name': 'Motoboy',
        'delivery_days': None,
    }

    far_quote = motoboy_quote(-16.60, -48.40)
    assert far_quote['fee'] == 50.0


def test_df_and_official_entorno_are_regional():
    assert is_regional_delivery('Brasília', 'DF')
    assert is_regional_delivery('Águas Lindas de Goiás', 'GO')
    assert is_regional_delivery('Formosa', 'GO')
    assert not is_regional_delivery('Goiânia', 'GO')
    assert not is_regional_delivery('Formosa', 'MG')


def test_correios_money_accepts_brazilian_format():
    assert _money('1.234,56') == _money('1234.56')


@pytest.mark.asyncio
async def test_correios_quote_uses_official_price_and_quantity(monkeypatch):
    requests = []

    async def handler(request):
        requests.append(request)
        if '/token/' in request.url.path:
            return httpx.Response(200, json={'token': 'test-token'})
        if '/preco/' in request.url.path:
            return httpx.Response(200, json=[
                {'coProduto': '03220', 'pcFinal': '32,90'},
                {'coProduto': '03298', 'pcFinal': '21,50'},
            ])
        return httpx.Response(200, json={'prazoEntrega': 6})

    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(shipping.httpx, 'AsyncClient', lambda **kwargs: original_client(transport=transport, **kwargs))
    for key, value in {
        'CORREIOS_ENABLED': 'true', 'CORREIOS_ENV': 'homologation',
        'CORREIOS_USERNAME': 'user', 'CORREIOS_API_CODE': 'secret',
        'CORREIOS_POSTING_CARD': 'card', 'CORREIOS_CONTRACT': 'contract', 'CORREIOS_DR': '72',
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(shipping, '_correios_token_value', '')

    quote = await correios_quote('01001000', quantity=3)

    assert quote['fee'] == 21.5
    assert quote['service_name'] == 'PAC'
    assert quote['delivery_days'] == 6
    payload = json.loads(next(request for request in requests if '/preco/' in request.url.path).content)
    assert payload['parametrosProduto'][0]['psObjeto'] == '1500'
