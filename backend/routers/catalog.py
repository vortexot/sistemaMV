"""Public catalog: products (active only), categories, favorites."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.db import db
from lib.dates import with_utc
from lib.security import get_current_user
from models.catalog import Category, Product

router = APIRouter(prefix="/catalog")


async def _category_map() -> dict[str, dict]:
    docs = await db.categories.find({}, {"_id": 0}).to_list(500)
    return {doc["id"]: doc for doc in docs}


def _product_out(doc: dict, cats: dict[str, dict]) -> Product:
    # admin-created docs already store category_name/slug — strip them and recompute
    # from the live categories so a rename/category swap always reflects here.
    data = {key: value for key, value in doc.items() if key not in ("category_name", "category_slug")}
    cat = cats.get(doc.get("category_id"), {})
    return Product(**with_utc(data), category_name=cat.get("name", ""), category_slug=cat.get("slug", ""))


@router.get("/products", response_model=list[Product])
async def list_products(
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    featured: bool | None = Query(default=None),
) -> list[Product]:
    query: dict = {"active": True, "archived": False}
    if category:
        cat = await db.categories.find_one({"slug": category}, {"_id": 0})
        if not cat:
            return []
        query["category_id"] = cat["id"]
    if featured is not None:
        query["featured"] = featured
    docs = await db.products.find(query, {"_id": 0}).sort([("featured", -1), ("created_at", -1)]).to_list(200)
    cats = await _category_map()
    if search:
        needle = search.lower().strip()
        docs = [
            doc
            for doc in docs
            if needle in doc["name"].lower() or needle in doc.get("brand", "").lower()
        ]
    return [_product_out(doc, cats) for doc in docs]


@router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str) -> Product:
    doc = await db.products.find_one(
        {"id": product_id, "active": True, "archived": False}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    cats = await _category_map()
    return _product_out(doc, cats)


@router.get("/categories", response_model=list[Category])
async def list_categories() -> list[Category]:
    docs = await db.categories.find({"active": True}, {"_id": 0}).sort([("order", 1), ("name", 1)]).to_list(100)
    return [Category(**with_utc(doc)) for doc in docs]

