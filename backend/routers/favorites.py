"""Favorites (COMPRADOR): list own favorites and toggle a product."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.security import get_current_user
from models.catalog import Product
from routers.catalog import _category_map, _product_out

router = APIRouter(prefix="/favorites")


@router.get("", response_model=list[Product])
async def my_favorites(user: dict = Depends(get_current_user)) -> list[Product]:
    favs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    ids = [fav["product_id"] for fav in favs]
    if not ids:
        return []
    docs = await db.products.find({"id": {"$in": ids}}, {"_id": 0}).to_list(200)
    cats = await _category_map()
    by_id = {doc["id"]: doc for doc in docs}
    ordered = [by_id[i] for i in ids if i in by_id]
    return [_product_out(doc, cats) for doc in ordered]


@router.post("/{product_id}/toggle")
async def toggle_favorite(product_id: str, user: dict = Depends(get_current_user)) -> dict:
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    existing = await db.favorites.find_one({"user_id": user["id"], "product_id": product_id})
    if existing:
        await db.favorites.delete_one({"_id": existing["_id"]})
        return {"favorited": False}
    await db.favorites.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "product_id": product_id,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"favorited": True}