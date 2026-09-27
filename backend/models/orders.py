"""Order and payment models."""

import uuid
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator

from lib.dates import utcnow

ORDER_STATUS = (
    "aguardando_pagamento",
    "aprovado",
    "preparando",
    "enviado",
    "em_transito",
    "entregue",
    "cancelado",
    "expirado",
)

ORDER_STATUS_LABELS = {
    "aguardando_pagamento": "Pagamento pendente",
    "aprovado": "Pagamento aprovado",
    "preparando": "Preparando pedido",
    "enviado": "Enviado",
    "em_transito": "Em trânsito",
    "entregue": "Entregue",
    "cancelado": "Cancelado",
    "expirado": "Reserva expirada",
}


class OrderItemIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    product_id: str = Field(min_length=1, max_length=100)
    qty: int = Field(ge=1, le=99)


class ShippingAddressIn(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    postal_code: str = Field(min_length=8, max_length=9)
    number: str = Field(min_length=1, max_length=30)
    complement: str = Field(default="", max_length=120)

    @field_validator('postal_code')
    @classmethod
    def valid_postal_code(cls, value: str) -> str:
        digits = re.sub(r'\D', '', value)
        if len(digits) != 8:
            raise ValueError('Informe um CEP válido com 8 números.')
        return digits


class ShippingAddress(ShippingAddressIn):
    street: str
    neighborhood: str
    city: str
    state: str


class ShippingQuoteIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    postal_code: str = Field(min_length=8, max_length=9)
    quantity: int = Field(default=1, ge=1, le=99)


class ShippingQuoteOut(BaseModel):
    method: Literal['motoboy', 'correios']
    available: bool
    fee: float | None
    distance_km: float | None
    origin_store: str | None
    service_code: str | None = None
    service_name: str | None = None
    delivery_days: int | None = None
    postal_code: str
    street: str
    neighborhood: str
    city: str
    state: str


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    items: list[OrderItemIn] = Field(min_length=1, max_length=100)
    idempotency_key: uuid.UUID
    fulfillment_method: Literal['delivery', 'pickup'] = 'delivery'
    payment_method: Literal['paypal', 'pix'] = 'paypal'
    shipping_address: ShippingAddressIn | None = None

    @model_validator(mode='after')
    def delivery_has_address(self):
        if self.fulfillment_method == 'delivery' and not self.shipping_address:
            raise ValueError('Informe o endereço de entrega.')
        return self


class OrderItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_id: str
    product_id: str
    name: str
    sku: str
    unit_price: float
    qty: int


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: str
    user_id: str
    customer_name: str
    customer_email: str
    items: list[OrderItem] = []
    items_total: float
    total: float
    fulfillment_method: Literal['delivery', 'pickup'] = 'delivery'
    shipping_fee: float = 0
    shipping_method: Literal['motoboy', 'correios'] | None = None
    shipping_distance_km: float | None = None
    shipping_origin: str | None = None
    shipping_service_code: str | None = None
    shipping_service_name: str | None = None
    shipping_delivery_days: int | None = None
    shipping_address: ShippingAddress | None = None
    status: str = "aguardando_pagamento"
    payment_method: str | None = None
    payment_status: str = "aguardando"
    pix_key: str | None = None
    pix_copy_paste: str | None = None
    pix_txid: str | None = None
    paypal_order_id: str | None = None
    paid_at: datetime | None = None
    reservation_expires_at: datetime | None = None
    expired_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class PaymentStatusOut(BaseModel):
    paypal_configured: bool
    paypal_mode: str | None = None
    pix_configured: bool = False
    pix_key: str | None = None


class PaypalCreateIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    order_id: str = Field(min_length=1, max_length=100)
    return_url: str = Field(max_length=2048)
    cancel_url: str = Field(max_length=2048)


class PaypalApprovalOut(BaseModel):
    order_id: str
    approval_url: str


class PaypalCaptureIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    order_id: str = Field(min_length=1, max_length=100)
