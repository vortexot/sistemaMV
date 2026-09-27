from lib.shipping import STORES, motoboy_quote


def test_motoboy_uses_nearest_store_and_caps_fee():
    valparaiso = STORES[0]
    quote = motoboy_quote(valparaiso['latitude'], valparaiso['longitude'])
    assert quote == {
        'method': 'motoboy',
        'available': True,
        'fee': 9.0,
        'distance_km': 0.0,
        'origin_store': 'Valparaíso de Goiás',
    }

    far_quote = motoboy_quote(-16.60, -48.40)
    assert far_quote['fee'] == 50.0
