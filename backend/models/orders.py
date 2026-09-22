"""Order and payment models."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict

from lib.dates import utcnow

ORDER_STATUS = (
    "aguardando_pagamento",
    "aprovado",
    "preparando",
    "enviado",
    "em_transito",
    "entregue",
    "cancelado",
)

ORDER_STATUS_LABELS = {
    "aguardando_pagamento": "Pagamento pendente",
    "aprovado": "Pagamento aprovado",
    "preparando": "Preparando pedido",
    "enviado": "Enviado",
    "em_transito": "Em trânsito",
    "entregue": "Entregue",
    "cancelado": "Cancelado",
}


class OrderItemIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    product_id: str = Field(min_length=1, max_length=100)
    qty: int = Field(ge=1, le=99)


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    items: list[OrderItemIn] = Field(min_length=1, max_length=100)
    idempotency_key: uuid.UUID


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
    status: str = "aguardando_pagamento"
    payment_method: str | None = None
    payment_status: str = "aguardando"
    paypal_order_id: str | None = None
    paid_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class PaymentStatusOut(BaseModel):
    paypal_configured: bool
    paypal_mode: str | None = None


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
