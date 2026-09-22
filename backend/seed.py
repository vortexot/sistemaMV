"""Seed MV Multimarcas with demo catalog, banners and staff accounts. Idempotent.

Run: cd /app/backend && python seed.py
"""

import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx

from lib.db import db, ensure_indexes
from lib.dates import utcnow
from lib.security import hash_password

from routers.files import STORAGE_DIR

IMAGES = {
    "hero": "https://images.unsplash.com/photo-1559697242-a465f2578a95?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzN8MHwxfHNlYXJjaHwyfHxzdHJlZXR3ZWFyJTIwbHV4dXJ5JTIwbW9kZWx8ZW58MHx8fHwxNzg5NDIxNDg0fDA&ixlib=rb-4.1.0&q=85",
    "cat-camisas": "https://images.unsplash.com/photo-1616847220575-31b062a4cd05?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzN8MHwxfHNlYXJjaHw0fHxzdHJlZXR3ZWFyJTIwbHV4dXJ5JTIwbW9kZWx8ZW58MHx8fHwxNzg5NDIxNDg0fDA&ixlib=rb-4.1.0&q=85",
    "cat-moletons": "https://images.unsplash.com/photo-1758521960846-9f140cca42e0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzB8MHwxfHNlYXJjaHwyfHx1cmJhbiUyMHNwb3J0JTIwcnVubmluZyUyMGhvZGRpZXxlbnwwfHx8fDE3ODk0MjE0ODR8MA&ixlib=rb-4.1.0&q=85",
    "cat-tenis": "https://images.unsplash.com/photo-1618677831708-0e7fda3148b4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwyfHxsdXh1cnklMjBzbmVha2VycyUyMHN0cmVldHdlYXJ8ZW58MHx8fHwxNzg5NDIxNDg0fDA&ixlib=rb-4.1.0&q=85",
    "cat-calcas": "https://images.unsplash.com/photo-1604828538836-b35298b0dcd6?crop=entropy&cs=srgb&fm=jpg&ixid=M3wzNDQ2NDN8MHwxfHNlYXJjaHwxfHxhdGhsZXRpYyUyMHNwb3J0c3dlYXIlMjBtb2RlbCUyMGRhcmt8ZW58MHx8fHwxNzg5NDIxNjY5fDA&ixlib=rb-4.1.0&q=85",
    "cat-shorts": "https://images.unsplash.com/photo-1624352307636-b3d403f23ec0?crop=entropy&cs=srgb&fm=jpg&ixid=M3wzNTY2NzB8MHwxfHNlYXJjaHw0fHx1cmJhbiUyMHNwb3J0JTIwcnVubmluZyUyMGhvZGRpZXxlbnwwfHx8fDE3ODk0MjE0ODR8MA&ixlib=rb-4.1.0&q=85",
    "cat-acessorios": "https://images.unsplash.com/photo-1634735274669-113558eb6b8a?crop=entropy&cs=srgb&fm=jpg&ixid=M3wzNDQ2NDN8MHwxfHNlYXJjaHwyfHxhdGhsZXRpYyUyMHNwb3J0c3dlYXIlMjBtb2RlbCUyMGRhcmt8ZW58MHx8fHwxNzg5NDIxNjY5fDA&ixlib=rb-4.1.0&q=85",
    "editorial": "https://images.unsplash.com/photo-1532332248682-206cc786359f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzN8MHwxfHNlYXJjaHwxfHxzdHJlZXR3ZWFyJTIwbHV4dXJ5JTIwbW9kZWx8ZW58MHx8fHwxNzg5NDIxNDg0fDA&ixlib=rb-4.1.0&q=85",
    "p-blackout": "https://images.unsplash.com/photo-1652823780977-b22c0ed84c97?crop=entropy&cs=srgb&fm=jpg&ixid=M3w0NjA1NTZ8MHwxfHNlYXJjaHwyfHxibGFjayUyMGhvZGRpZSUyMHN0cmVldHdlYXIlMjBmYXNoaW9ufGVufDB8fHx8MTc4OTQyMTY2OXww&ixlib=rb-4.1.0&q=85",
    "p-court-hoodie": "https://images.unsplash.com/photo-1673092147872-5ddb03194341?crop=entropy&cs=srgb&fm=jpg&ixid=M3w0NjA1NTZ8MHwxfHNlYXJjaHw0fHxibGFjayUyMGhvZGRpZSUyMHN0cmVldHdlYXIlMjBmYXNoaW9ufGVufDB8fHx8MTc4OTQyMTY2OXww&ixlib=rb-4.1.0&q=85",
    "p-pace-pro": "https://images.unsplash.com/photo-1559050993-d4e4fbf11769?crop=entropy&cs=srgb&fm=jpg&ixid=M3w0NjY2NzN8MHwxfHNlYXJjaHwzfHxsdXh1cnklMjBzbmVha2VycyUyMHByb2R1Y3QlMjBwaG90b2dyYXBoeXxlbnwwfHx8fDE3ODk0MjE2Njl8MA&ixlib=rb-4.1.0&q=85",
    "p-court-luxe": "https://images.unsplash.com/photo-1560769629-975ec94e6a86?crop=entropy&cs=srgb&fm=jpg&ixid=M3w0NjY2NzN8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzbmVha2VycyUyMHByb2R1Y3QlMjBwaG90b2dyYXBoeXxlbnwwfHx8fDE3ODk0MjE2Njl8MA&ixlib=rb-4.1.0&q=85",
    "p-shadow": "https://images.unsplash.com/photo-1646191152321-673e8b541cb8?crop=entropy&cs=srgb&fm=jpg&ixid=M3wzNDQ2NDN8MHwxfHNlYXJjaHw0fHxhdGhsZXRpYyUyMHNwb3J0c3dlYXIlMjBtb2RlbCUyMGRhcmt8ZW58MHx8fHwxNzg5NDIxNjY5fDA&ixlib=rb-4.1.0&q=85",
}

# Accounts must be provisioned explicitly; seeds never create shared/default credentials.
USERS = []

CATEGORIES = [
    {"name": "Camisas", "slug": "camisas", "desc": "Caimento premium e tecidos técnicos para o dia a dia.", "order": 1, "img_key": "cat-camisas"},
    {"name": "Moletons", "slug": "moletons", "desc": "Peso pesado, conforto e presença em cada costura.", "order": 2, "img_key": "cat-moletons"},
    {"name": "Tênis", "slug": "tenis", "desc": "Ícones de performance com acabamento de luxo.", "order": 3, "img_key": "cat-tenis"},
    {"name": "Calças", "slug": "calcas", "desc": "Cortes técnicos para quem se move diferente.", "order": 4, "img_key": "cat-calcas"},
    {"name": "Shorts", "slug": "shorts", "desc": "Leveza e liberdade de movimento.", "order": 5, "img_key": "cat-shorts"},
    {"name": "Acessórios", "slug": "acessorios", "desc": "Os detalhes dourados que fecham o look.", "order": 6, "img_key": "cat-acessorios"},
]

PRODUCTS = [
    {"sku": "GS-CAM-001", "name": "Camisa Golden Velocity Pro", "brand": "Golden Pro", "cat": "camisas", "price": 189.90, "promo": 149.90, "stock": 24, "tag": "novo", "featured": True, "sizes": ["P", "M", "G", "GG"], "colors": ["Preto", "Dourado"], "desc": "Tecido técnico de compressão leve com detalhes dourados refletivos. Feita para ritmo intenso e presença urbana.", "img_key": "cat-camisas"},
    {"sku": "GS-MOL-002", "name": "Moletom Golden Blackout", "brand": "Golden Street", "cat": "moletons", "price": 349.90, "promo": None, "stock": 12, "tag": "mais_vendido", "featured": True, "sizes": ["P", "M", "G"], "colors": ["Preto"], "desc": "Felpa pesada 480g, capuz estruturado e bordado dourado. O moletom definitivo do streetwear premium.", "img_key": "p-blackout"},
    {"sku": "GS-TEN-003", "name": "Tênis Golden Pace Pro", "brand": "Golden Pro", "cat": "tenis", "price": 599.90, "promo": 499.90, "stock": 8, "tag": "oferta", "featured": True, "sizes": ["38", "39", "40", "41", "42"], "colors": ["Preto", "Branco"], "desc": "Entressola em espuma responsiva e cabedal premium. Velocidade com sofisticação.", "img_key": "p-pace-pro"},
    {"sku": "GS-CAL-004", "name": "Calça Golden Tech Cargo", "brand": "Golden Street", "cat": "calcas", "price": 279.90, "promo": None, "stock": 18, "tag": None, "featured": False, "sizes": ["38", "40", "42"], "colors": ["Preto", "Cinza"], "desc": "Tecido ripstop elástico com bolsos cargo utilitários e acabamento premium.", "img_key": "cat-calcas"},
    {"sku": "GS-SHO-005", "name": "Short Golden Sprint Elite", "brand": "Golden Pro", "cat": "shorts", "price": 129.90, "promo": None, "stock": 30, "tag": "novo", "featured": False, "sizes": ["P", "M", "G"], "colors": ["Preto"], "desc": "Leve, respirável e de secagem rápida. Feito para sprints na pista e na rua.", "img_key": "cat-shorts"},
    {"sku": "GS-ACE-006", "name": "Boné Golden Crown", "brand": "Golden Core", "cat": "acessorios", "price": 89.90, "promo": None, "stock": 40, "tag": None, "featured": False, "sizes": ["Único"], "colors": ["Preto"], "desc": "Boné strapback em sar premium com logo dourado bordado em alto relevo.", "img_key": None},
    {"sku": "GS-MOL-007", "name": "Moletom Golden Shadow Zip", "brand": "Golden Street", "cat": "moletons", "price": 389.90, "promo": 329.90, "stock": 3, "tag": "oferta", "featured": False, "sizes": ["M", "G", "GG"], "colors": ["Preto", "Chumbo"], "desc": "Zíper metálico dourado, forro térmico e silhueta oversize. Edição limitada.", "img_key": "p-shadow"},
    {"sku": "GS-MOL-008", "name": "Moletom Golden Court", "brand": "Golden Core", "cat": "moletons", "price": 329.90, "promo": None, "stock": 0, "tag": None, "featured": False, "sizes": ["P", "M"], "colors": ["Preto"], "desc": "Clássico do basquete com gola careca e patch dourado. Reposição em breve.", "img_key": "p-court-hoodie"},
    {"sku": "GS-TEN-009", "name": "Tênis Court Luxe", "brand": "Golden Pro", "cat": "tenis", "price": 449.90, "promo": 399.90, "stock": 15, "tag": "oferta", "featured": False, "sizes": ["39", "40", "41"], "colors": ["Branco", "Dourado"], "desc": "Silhueta low-top em couro premium com detalhes dourados discretos.", "img_key": "p-court-luxe"},
    {"sku": "GS-CAM-010", "name": "Camiseta Golden Essential", "brand": "Golden Core", "cat": "camisas", "price": 99.90, "promo": 79.90, "stock": 50, "tag": "mais_vendido", "featured": False, "sizes": ["P", "M", "G", "GG"], "colors": ["Preto", "Branco"], "desc": "Algodão penteado 30.1 com gola reforçada e selo dourado. A base de qualquer look.", "img_key": None},
]

BANNERS = [
    {"title": "Coleção Velocity", "subtitle": "Performance de elite com acabamento premium.", "img_key": "editorial", "active": True},
    {"title": "Golden Edition", "subtitle": "Peças de edição limitada com detalhes dourados.", "img_key": "p-shadow", "active": True},
]

EXT_BY_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}


async def save_seed_image(key: str, url: str) -> str | None:
    """Download once per seed key; reuse the stored file_id on re-runs."""
    existing = await db.files.find_one({"seed_key": key}, {"_id": 0})
    if existing:
        return existing["id"]
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except Exception as exc:  # offline pod: product just ships without an image (fallback UI covers it)
        print(f"  ! download falhou ({key}): {exc}")
        return None
    data = resp.content
    ctype = (resp.headers.get("content-type") or "image/jpeg").split(";")[0].strip().lower()
    ext = EXT_BY_MIME.get(ctype, ".jpg")
    file_id = str(uuid.uuid4())
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    path = STORAGE_DIR / f"{file_id}{ext}"
    path.write_bytes(data)
    await db.files.insert_one(
        {
            "id": file_id,
            "storage_path": str(path),
            "original_filename": f"{key}{ext}",
            "content_type": EXT_BY_MIME.get(ext, "image/jpeg"),
            "size": len(data),
            "uploaded_by": "seed",
            "created_at": utcnow(),
            "is_deleted": False,
            "seed_key": key,
        }
    )
    print(f"  · imagem {key} salva ({len(data) // 1024} KB)")
    return file_id


async def seed() -> None:
    await ensure_indexes()

    print("→ contas")
    for entry in USERS:
        if await db.users.find_one({"email": entry["email"]}, {"_id": 0}):
            print(f"  · usuário já existe: {entry['email']}")
            continue
        await db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "name": entry["name"],
                "email": entry["email"],
                "password_hash": hash_password(entry["password"]),
                "role": entry["role"],
                "status": "ativo",
                "picture": None,
                "token_version": 0,
                "created_at": utcnow(),
            }
        )
        print(f"  + usuário {entry['email']} ({entry['role']})")

    print("→ categorias")
    for cat in CATEGORIES:
        if await db.categories.find_one({"slug": cat["slug"]}, {"_id": 0}):
            print(f"  · categoria já existe: {cat['slug']}")
            continue
        file_id = await save_seed_image(cat["img_key"], IMAGES[cat["img_key"]])
        doc = {
            "id": str(uuid.uuid4()),
            "name": cat["name"],
            "slug": cat["slug"],
            "description": cat["desc"],
            "order": cat["order"],
            "active": True,
            "image_file_id": file_id,
            "created_at": utcnow(),
        }
        await db.categories.insert_one(doc)
        print(f"  + categoria {cat['name']}")

    cat_ids = {}
    async for doc in db.categories.find({}, {"_id": 0}):
        cat_ids[doc["slug"]] = doc["id"]

    print("→ produtos")
    for product in PRODUCTS:
        if await db.products.find_one({"sku": product["sku"]}, {"_id": 0}):
            print(f"  · produto já existe: {product['sku']}")
            continue
        file_id = await save_seed_image(product["img_key"], IMAGES[product["img_key"]]) if product["img_key"] else None
        pid = str(uuid.uuid4())
        doc = {
            "id": pid,
            "name": product["name"],
            "sku": product["sku"],
            "brand": product["brand"],
            "category_id": cat_ids[product["cat"]],
            "price": product["price"],
            "promo_price": product["promo"],
            "stock": product["stock"],
            "sizes": product["sizes"],
            "colors": product["colors"],
            "description": product["desc"],
            "tag": product["tag"],
            "featured": product["featured"],
            "active": True,
            "archived": False,
            "image_file_id": file_id,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
        await db.products.insert_one(doc)
        if file_id:
            await db.product_images.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "product_id": pid,
                    "file_id": file_id,
                    "is_main": True,
                    "uploaded_by": "seed",
                    "created_at": utcnow(),
                }
            )
        print(f"  + produto {product['name']} ({product['sku']})")

    print("→ banners")
    for banner in BANNERS:
        if await db.banners.find_one({"title": banner["title"]}, {"_id": 0}):
            print(f"  · banner já existe: {banner['title']}")
            continue
        file_id = await save_seed_image(banner["img_key"], IMAGES[banner["img_key"]])
        await db.banners.insert_one(
            {
                "id": str(uuid.uuid4()),
                "title": banner["title"],
                "subtitle": banner["subtitle"],
                "image_file_id": file_id,
                "active": banner["active"],
                "created_at": utcnow(),
            }
        )
        print(f"  + banner {banner['title']}")

    print("✔ seed concluído — catálogo, banners e contas prontos.")


if __name__ == "__main__":
    asyncio.run(seed())
