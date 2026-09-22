"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "users": [
        IndexModel([('id', ASCENDING)], name='id_unique', unique=True),
        IndexModel([("email", ASCENDING)], name="email_unique", unique=True),
        IndexModel([("role", ASCENDING)], name="role_idx"),
    ],
    "products": [
        IndexModel([("sku", ASCENDING)], name="sku_unique", unique=True),
        IndexModel([("active", ASCENDING), ("archived", ASCENDING), ("featured", DESCENDING), ("created_at", DESCENDING)], name="catalog_active"),
        IndexModel([("category_id", ASCENDING)], name="category_idx"),
    ],
    "categories": [
        IndexModel([("slug", ASCENDING)], name="slug_unique", unique=True),
        IndexModel([("order", ASCENDING)], name="order_asc"),
    ],
    "banners": [IndexModel([("active", ASCENDING), ("order", ASCENDING), ("created_at", ASCENDING)], name="indoor_order")],
    "files": [IndexModel([("id", ASCENDING)], name="id_unique", unique=True)],
    "product_images": [
        IndexModel([("product_id", ASCENDING)], name="product_idx"),
        IndexModel([("file_id", ASCENDING)], name="file_idx"),
    ],
    "orders": [
        IndexModel([('user_id', ASCENDING), ('idempotency_key', ASCENDING)], name='order_idempotency', unique=True,
                   partialFilterExpression={'idempotency_key': {'$type': 'string'}}),
        IndexModel([("number", ASCENDING)], name="number_unique", unique=True),
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_orders"),
        IndexModel([("status", ASCENDING)], name="status_idx"),
    ],
    "order_items": [IndexModel([("order_id", ASCENDING)], name="order_idx")],
    "payments": [IndexModel([("order_id", ASCENDING)], name="order_idx")],
    "shipments": [IndexModel([("order_id", ASCENDING)], name="order_idx")],
    "addresses": [IndexModel([("user_id", ASCENDING)], name="user_idx")],
    "favorites": [
        IndexModel([("user_id", ASCENDING), ("product_id", ASCENDING)], name="user_product", unique=True),
    ],
    "reviews": [IndexModel([("product_id", ASCENDING)], name="product_idx")],
    "coupons": [IndexModel([("code", ASCENDING)], name="code_unique", unique=True)],
    "carts": [IndexModel([("user_id", ASCENDING)], name="user_idx")],
    "cart_items": [IndexModel([("cart_id", ASCENDING)], name="cart_idx")],
    "login_attempts": [
        IndexModel([('created_at', ASCENDING)], name='attempt_ttl', expireAfterSeconds=86400),
        IndexModel([("email", ASCENDING), ("created_at", DESCENDING)], name="email_window"),
    ],
    "password_reset_tokens": [
        IndexModel([("token", ASCENDING)], name="token_unique", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    'auth_limits': [IndexModel([('expires_at', ASCENDING)], name='limits_ttl', expireAfterSeconds=0)],
    "revoked_tokens": [
        IndexModel([("jti", ASCENDING)], name="jti_unique", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception:
                logger.error('ensure_indexes_failed collection=%s index=%s', collection, model.document['name'])
                raise
