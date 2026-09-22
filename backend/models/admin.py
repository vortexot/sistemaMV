"""Admin-facing models: dashboard KPIs, customers, stock, reports."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal


class LowStockItem(BaseModel):
    id: str
    name: str
    sku: str
    stock: int


class DashboardOut(BaseModel):
    welcome: str
    produtos_ativos: int
    clientes: int
    pedidos: int
    estoque_baixo: int
    produtos_sem_estoque: int
    resumo: str
    low_stock: list[LowStockItem]


class CustomerOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    status: str
    created_at: datetime


class CustomerUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: Literal['admin', 'atendente', 'comprador'] | None = None
    status: Literal['ativo', 'bloqueado'] | None = None

    @field_validator('role', 'status')
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError('Campo obrigatório.')
        return value


class StockRowOut(BaseModel):
    id: str
    name: str
    sku: str
    stock: int
    active: bool
    archived: bool
    status: str  # em_estoque | estoque_baixo | sem_estoque


class StockUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    stock: int = Field(ge=0, le=10000000)


class TopProduct(BaseModel):
    product_id: str
    name: str
    qty: int
    receita: float


class StatusCount(BaseModel):
    status: str
    label: str
    count: int


class ReportOut(BaseModel):
    pedidos_total: int
    vendas_total: float
    ticket_medio: float | None
    clientes_cadastrados: int
    pedidos_por_status: list[StatusCount]
    produtos_mais_vendidos: list[TopProduct]
    estoque_baixo: list[LowStockItem]


class OrderStatusUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: str
