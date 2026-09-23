"""Catalog models: products, categories, banners."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict, field_validator
from urllib.parse import urlsplit

from lib.dates import utcnow

TAG_VALUES = ("novo", "oferta", "mais_vendido")


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    sku: str
    brand: str
    category_id: str
    category_name: str = ""
    category_slug: str = ""
    price: float
    promo_price: float | None = None
    stock: int = 0
    sizes: list[str] = []
    colors: list[str] = []
    description: str = ""
    tag: str | None = None
    featured: bool = False
    active: bool = True
    archived: bool = False
    image_file_id: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CatalogProduct(BaseModel):
    """Fields intentionally exposed by the public storefront catalog."""

    id: str
    name: str
    sku: str
    brand: str
    category_name: str = ""
    category_slug: str = ""
    price: float
    promo_price: float | None = None
    in_stock: bool
    sizes: list[str] = []
    colors: list[str] = []
    description: str = ""
    tag: str | None = None
    featured: bool = False
    image_file_id: str | None = None


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    name: str = Field(min_length=2, max_length=160)
    sku: str = Field(min_length=2, max_length=40)
    brand: str = Field(min_length=1, max_length=80)
    category_id: str
    price: float = Field(ge=0, le=10000000)
    promo_price: float | None = Field(default=None, ge=0, le=10000000)
    stock: int = Field(default=0, ge=0, le=10000000)
    sizes: list[str] = []
    colors: list[str] = []
    description: str = ""
    tag: str | None = None
    featured: bool = False
    active: bool = True
    image_file_id: str | None = None


class ProductUpdate(BaseModel):
    """PATCH semantics: absent keys are ignored; explicit null clears the field."""
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

    name: str | None = None
    sku: str | None = None
    brand: str | None = None
    category_id: str | None = None
    price: float | None = None
    promo_price: float | None = None
    stock: int | None = None
    sizes: list[str] | None = None
    colors: list[str] | None = None
    description: str | None = None
    tag: str | None = None
    featured: bool | None = None
    active: bool | None = None
    archived: bool | None = None
    image_file_id: str | None = None


class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str
    description: str = ""
    order: int = 0
    active: bool = True
    image_file_id: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class CatalogCategory(BaseModel):
    """Category fields required by the public storefront."""

    id: str
    name: str
    slug: str
    description: str = ""
    image_file_id: str | None = None


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=500)
    order: int = Field(default=0, ge=0, le=100000)
    active: bool = True
    image_file_id: str | None = None


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    order: int | None = Field(default=None, ge=0, le=100000)
    active: bool | None = None
    image_file_id: str | None = None

    @field_validator("name", "description", "order", "active")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("Este campo não pode ser nulo.")
        return value


class Banner(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    subtitle: str = ""
    image_file_id: str | None = None
    active: bool = True
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    order: int = 0
    link: str = ""
    alt_text: str = ""


class BannerCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: str = Field(min_length=2, max_length=120)
    subtitle: str = Field(default="", max_length=500)
    image_file_id: str = Field(min_length=1, max_length=100)
    active: bool = True
    order: int = Field(default=0, ge=0, le=100000)
    link: str = Field(default="", max_length=2048)
    alt_text: str = Field(default="", max_length=300)

    @field_validator("link")
    @classmethod
    def safe_link(cls, value: str) -> str:
        if not value:
            return value
        if any(ord(c) < 32 for c in value) or "\\" in value:
            raise ValueError("Link inválido.")
        parsed = urlsplit(value)
        if value.startswith("/") and not value.startswith("//"):
            return value
        if parsed.scheme in ("https", "http") and parsed.hostname and not parsed.username and not parsed.password:
            return value
        raise ValueError("Use um link http(s) ou caminho iniciado por /.")


class BannerUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: str | None = None
    subtitle: str | None = None
    image_file_id: str | None = None
    active: bool | None = None
    order: int | None = None
    link: str | None = None
    alt_text: str | None = None

    @field_validator("title", "subtitle", "image_file_id", "active", "order", "link", "alt_text")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("Este campo não pode ser nulo.")
        return value
