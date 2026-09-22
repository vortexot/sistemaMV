"""Owned orders; Mongo transactions reserve/release stock and persist idempotency."""
import hashlib
import json
import os
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError, OperationFailure
from lib.db import db
from lib.dates import utcnow, with_utc
from lib.paypal import capture_order as paypal_capture, create_order as paypal_create
from lib.paypal import paypal_configured, paypal_mode
from lib.security import get_current_user
from models.orders import Order, OrderCreate, OrderItem, PaymentStatusOut, PaypalApprovalOut, PaypalCaptureIn, PaypalCreateIn

router = APIRouter()


def money(value):
    amount = Decimal(str(value))
    if not amount.is_finite() or amount < 0 or amount > 1_000_000_000_000:
        raise HTTPException(409, 'Valor financeiro inválido.')
    return amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


async def transaction(callback):
    try:
        async with await db.client.start_session() as session:
            return await session.with_transaction(callback)
    except OperationFailure as error:
        if error.code in (20, 303):
            raise HTTPException(503, 'Pedidos indisponíveis: armazenamento transacional necessário.')
        raise


def available():
    if not paypal_configured():
        raise HTTPException(503, 'Pagamentos indisponíveis no momento.')


@router.get('/payments/status', response_model=PaymentStatusOut)
async def payments_status():
    configured = paypal_configured()
    return PaymentStatusOut(paypal_configured=configured, paypal_mode=paypal_mode() if configured else None)


async def _attach_items(doc, session=None):
    items = await db.order_items.find({'order_id': doc['id']}, {'_id': 0}, session=session).to_list(100)
    return Order(**with_utc(doc), items=[OrderItem(**with_utc(item)) for item in items])


async def owned(order_id, user, session=None):
    doc = await db.orders.find_one({'id': order_id, 'user_id': user['id']}, {'_id': 0}, session=session)
    if not doc:
        raise HTTPException(404, 'Pedido não encontrado.')
    return doc


@router.post('/orders', response_model=Order)
async def create_order(input: OrderCreate, user: dict = Depends(get_current_user)):
    available()
    quantities = {}
    for item in input.items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.qty
    if any(qty > 99 for qty in quantities.values()):
        raise HTTPException(422, 'Limite de 99 unidades por produto.')
    fingerprint = hashlib.sha256(json.dumps(quantities, sort_keys=True).encode()).hexdigest()
    key = str(input.idempotency_key)

    async def create(session):
        old = await db.orders.find_one({'user_id': user['id'], 'idempotency_key': key}, {'_id': 0}, session=session)
        if old:
            if old.get('request_hash') != fingerprint:
                raise HTTPException(409, 'A chave de repetição já pertence a outro carrinho.')
            return await _attach_items(old, session)
        pending = await db.orders.count_documents({'user_id': user['id'], 'status': 'aguardando_pagamento'}, session=session)
        if pending >= 5:
            raise HTTPException(409, 'Conclua ou cancele seus pedidos pendentes.')
        order_id, items = str(uuid.uuid4()), []
        for product_id, qty in sorted(quantities.items()):
            product = await db.products.find_one({'id': product_id, 'active': True, 'archived': False}, {'_id': 0}, session=session)
            if not product:
                raise HTTPException(409, 'Produto indisponível.')
            result = await db.products.update_one({'id': product_id, 'stock': {'$gte': qty}, 'active': True, 'archived': False},
                                                  {'$inc': {'stock': -qty}}, session=session)
            if not result.modified_count:
                raise HTTPException(409, 'Estoque insuficiente.')
            unit = money(product['promo_price'] if product.get('promo_price') is not None else product['price'])
            items.append({'id': str(uuid.uuid4()), 'order_id': order_id, 'product_id': product_id,
                          'name': product['name'], 'sku': product['sku'], 'unit_price': float(unit), 'qty': qty})
        total = float(sum((money(i['unit_price']) * i['qty'] for i in items), Decimal(0)))
        order = {'id': order_id, 'number': 'MV-' + order_id, 'user_id': user['id'], 'customer_name': user['name'],
                 'customer_email': user['email'], 'items_total': total, 'total': total,
                 'status': 'aguardando_pagamento', 'payment_method': 'paypal', 'payment_status': 'aguardando',
                 'paypal_order_id': None, 'created_at': utcnow(), 'idempotency_key': key, 'request_hash': fingerprint}
        await db.orders.insert_one(order, session=session)
        await db.order_items.insert_many(items, session=session)
        return Order(**with_utc(order), items=[OrderItem(**with_utc(i)) for i in items])
    try:
        return await transaction(create)
    except DuplicateKeyError:
        old = await db.orders.find_one({'user_id': user['id'], 'idempotency_key': key}, {'_id': 0})
        if not old or old.get('request_hash') != fingerprint:
            raise HTTPException(409, 'Pedido conflitante. Atualize o carrinho.')
        return await _attach_items(old)


@router.get('/orders/mine', response_model=list[Order])
async def my_orders(user: dict = Depends(get_current_user)):
    docs = await db.orders.find({'user_id': user['id']}, {'_id': 0}).sort('created_at', -1).to_list(100)
    return [await _attach_items(doc) for doc in docs]


@router.get('/orders/{order_id}', response_model=Order)
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    return await _attach_items(await owned(order_id, user))


@router.post('/payments/paypal/create', response_model=PaypalApprovalOut)
async def paypal_create_payment(input: PaypalCreateIn, user: dict = Depends(get_current_user)):
    available()
    order = await owned(input.order_id, user)
    if order['status'] != 'aguardando_pagamento' or order['payment_status'] != 'aguardando':
        raise HTTPException(409, 'Este pedido não está aguardando pagamento.')
    expected = urlsplit(os.getenv('PUBLIC_ORIGIN', 'http://localhost:3000'))
    for value in (input.return_url, input.cancel_url):
        parsed = urlsplit(value)
        if (parsed.scheme, parsed.netloc) != (expected.scheme, expected.netloc) or parsed.username or parsed.password or '\\' in value:
            raise HTTPException(422, 'Endereço de retorno inválido.')
    origin = os.getenv('PUBLIC_ORIGIN', 'http://localhost:3000').rstrip('/')
    try:
        provider_id, approval = await paypal_create(amount=order['total'], reference=order['number'],
            return_url=f'{origin}/checkout?paypal=return&order_id={order["id"]}',
            cancel_url=f'{origin}/checkout?paypal=cancel&order_id={order["id"]}', request_id=order['id'])
    except Exception:
        raise HTTPException(502, 'Não foi possível iniciar o pagamento. Tente novamente.')
    if not approval:
        raise HTTPException(502, 'Link de aprovação indisponível.')
    result = await db.orders.update_one({'id': order['id'], 'status': 'aguardando_pagamento', 'payment_status': 'aguardando'},
                                         {'$set': {'paypal_order_id': provider_id}})
    if not result.matched_count:
        raise HTTPException(409, 'O pedido foi alterado.')
    return PaypalApprovalOut(order_id=order['id'], approval_url=approval)


@router.post('/payments/paypal/capture', response_model=Order)
async def paypal_capture_payment(input: PaypalCaptureIn, user: dict = Depends(get_current_user)):
    available()
    order = await owned(input.order_id, user)
    if order['payment_status'] == 'pago':
        return await _attach_items(order)
    if order['status'] != 'aguardando_pagamento' or not order.get('paypal_order_id'):
        raise HTTPException(409, 'Pagamento não iniciado ou pedido cancelado.')
    result = await db.orders.update_one({'id': order['id'], 'status': 'aguardando_pagamento', 'payment_status': {'$in': ['aguardando', 'processando']}},
                                        {'$set': {'payment_status': 'processando'}})
    if not result.matched_count:
        raise HTTPException(409, 'O pedido foi alterado.')
    # Keep processing on timeout; cancellation is unsafe until provider reconciliation.
    try:
        capture = await paypal_capture(order['paypal_order_id'], request_id=order['id'] + '-c')
    except Exception:
        raise HTTPException(502, 'Confirmação pendente. Tente novamente.')
    captures = [c for p in capture.get('purchase_units', []) for c in p.get('payments', {}).get('captures', [])]
    try:
        valid = (capture.get('id') == order['paypal_order_id'] and capture.get('status') == 'COMPLETED' and captures
                 and all(c.get('status') == 'COMPLETED' and c.get('amount', {}).get('currency_code') == 'BRL' for c in captures)
                 and sum((money(c['amount']['value']) for c in captures), Decimal(0)) == money(order['total']))
    except (KeyError, InvalidOperation, TypeError, HTTPException):
        valid = False
    if not valid:
        raise HTTPException(409, 'Pagamento ainda não confirmado.')
    await db.orders.update_one({'id': order['id'], 'status': 'aguardando_pagamento', 'payment_status': 'processando'},
                                {'$set': {'status': 'aprovado', 'payment_status': 'pago', 'paid_at': utcnow()}})
    return await _attach_items(await owned(order['id'], user))


@router.post('/payments/paypal/cancel', response_model=Order)
async def paypal_cancel_payment(input: PaypalCaptureIn, user: dict = Depends(get_current_user)):
    async def cancel(session):
        order = await owned(input.order_id, user, session)
        if order['status'] != 'aguardando_pagamento':
            return await _attach_items(order, session)
        if order['payment_status'] != 'aguardando':
            raise HTTPException(409, 'A confirmação está em andamento. Tente novamente.')
        await db.orders.update_one({'id': order['id']}, {'$set': {'status': 'cancelado', 'payment_status': 'cancelado'}}, session=session)
        items = await db.order_items.find({'order_id': order['id']}, session=session).to_list(100)
        for item in items:
            await db.products.update_one({'id': item['product_id']}, {'$inc': {'stock': item['qty']}}, session=session)
        return await _attach_items(await owned(order['id'], user, session), session)
    return await transaction(cancel)
