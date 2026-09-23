"""Admin router: dashboard, products, categories, banners, customers, orders, stock, reports.
Every route enforces RBAC on the backend — admin sees all; atendente only the view-only surfaces."""

import re
import unicodedata
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from lib.db import db
from lib.dates import utcnow, with_utc
from lib.audit import audit_event
from lib.security import require_recent_auth, require_roles
from models.admin import (
    CustomerOut,
    CustomerUpdate,
    DashboardOut,
    LowStockItem,
    OrderStatusUpdate,
    ReportOut,
    StatusCount,
    StockRowOut,
    StockUpdate,
    TopProduct,
)
from models.catalog import (
    TAG_VALUES,
    Banner,
    BannerCreate,
    BannerUpdate,
    Category,
    CategoryCreate,
    CategoryUpdate,
    Product,
    ProductCreate,
    ProductUpdate,
)
from models.orders import ORDER_STATUS_LABELS, Order, PaypalCaptureIn
from routers.catalog import _category_map, _product_out
from routers.orders import _attach_items, reconcile_payment

router = APIRouter(prefix="/admin")

ROLES = ("admin", "atendente", "comprador")
CUSTOMER_FIELDS = ("id", "name", "email", "role", "status", "created_at")


def slugify(name: str) -> str:
    norm = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", norm.lower()).strip("-")
    return slug or str(uuid.uuid4())[:8]


async def _touch_product_images(product_id: str, file_id: str | None, uploaded_by: str) -> None:
    if not file_id:
        return
    await db.product_images.update_one(
        {"product_id": product_id, "is_main": True},
        {
            "$set": {
                "product_id": product_id,
                "file_id": file_id,
                "is_main": True,
                "uploaded_by": uploaded_by,
                "created_at": utcnow(),
            },
            "$setOnInsert": {"id": str(uuid.uuid4())},
        },
        upsert=True,
    )


# ---------------------------------------------------------------- dashboard
@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(user: dict = Depends(require_roles("admin"))) -> DashboardOut:
    produtos_ativos = await db.products.count_documents({"active": True, "archived": False})
    clientes = await db.users.count_documents({"role": "comprador"})
    pedidos = await db.orders.count_documents({})
    estoque_baixo = await db.products.count_documents(
        {"active": True, "archived": False, "stock": {"$gt": 0, "$lte": 5}}
    )
    sem_estoque = await db.products.count_documents({"active": True, "archived": False, "stock": {"$lte": 0}})
    low_docs = (
        await db.products.find({"stock": {"$lte": 5}}, {"_id": 0})
        .sort([("stock", 1), ("name", 1)])
        .to_list(8)
    )
    resumo = (
        f"{produtos_ativos} produto(s) ativo(s) na vitrine · {clientes} cliente(s) cadastrado(s) · "
        f"{pedidos} pedido(s) registrado(s) · {estoque_baixo} com estoque baixo e {sem_estoque} sem estoque."
    )
    if pedidos == 0:
        resumo += " Nenhum pedido real registrado ainda — os dados de vendas aparecem aqui quando o PayPal for configurado."
    return DashboardOut(
        welcome=f"Bem-vindo, {user['name'].split(' ')[0]}",
        produtos_ativos=produtos_ativos,
        clientes=clientes,
        pedidos=pedidos,
        estoque_baixo=estoque_baixo,
        produtos_sem_estoque=sem_estoque,
        resumo=resumo,
        low_stock=[LowStockItem(**{k: d[k] for k in ("id", "name", "sku", "stock")}) for d in low_docs],
    )


# ---------------------------------------------------------------- products
@router.get("/products", response_model=list[Product])
async def admin_products(_: dict = Depends(require_roles("admin"))) -> list[Product]:
    docs = await db.products.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    cats = await _category_map()
    return [_product_out(doc, cats) for doc in docs]


@router.post("/products", response_model=Product)
async def create_product(input: ProductCreate, user: dict = Depends(require_recent_auth("admin"))) -> Product:
    sku = input.sku.strip().upper()
    if await db.products.find_one({"sku": sku}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Já existe um produto com este SKU.")
    if input.tag is not None and input.tag not in TAG_VALUES:
        raise HTTPException(status_code=422, detail="Etiqueta inválida.")
    cat = await db.categories.find_one({"id": input.category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    if input.promo_price is not None and input.promo_price >= input.price:
        raise HTTPException(status_code=422, detail="O preço promocional deve ser menor que o preço.")
    product = Product(
        name=input.name.strip(),
        sku=sku,
        brand=input.brand.strip(),
        category_id=input.category_id,
        category_name=cat["name"],
        category_slug=cat["slug"],
        price=input.price,
        promo_price=input.promo_price,
        stock=input.stock,
        sizes=[s.strip() for s in input.sizes if s.strip()],
        colors=[c.strip() for c in input.colors if c.strip()],
        description=input.description,
        tag=input.tag,
        featured=input.featured,
        active=input.active,
        image_file_id=input.image_file_id,
    )
    await db.products.insert_one(product.model_dump())
    await _touch_product_images(product.id, input.image_file_id, user["id"])
    return product


@router.patch("/products/{product_id}", response_model=Product)
async def update_product(
    product_id: str, input: ProductUpdate, user: dict = Depends(require_recent_auth("admin"))
) -> Product:
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    data = input.model_dump(exclude_unset=True)
    merged = {k: doc[k] for k in ProductCreate.model_fields if k in doc}
    merged.update({k: v for k, v in data.items() if k != 'archived'})
    try:
        validated = ProductCreate(**merged)
    except ValidationError:
        raise HTTPException(422, 'Confira os campos do produto.')
    if validated.promo_price is not None and validated.promo_price >= validated.price:
        raise HTTPException(422, 'O preço promocional deve ser menor que o preço.')
    if 'archived' in data and data['archived'] is None:
        raise HTTPException(422, 'Estado inválido.')
    if "sku" in data and data["sku"]:
        sku = data["sku"].strip().upper()
        clash = await db.products.find_one({"sku": sku, "id": {"$ne": product_id}}, {"_id": 0})
        if clash:
            raise HTTPException(status_code=409, detail="Já existe um produto com este SKU.")
        data["sku"] = sku
    if "tag" in data and data["tag"] is not None and data["tag"] not in TAG_VALUES:
        raise HTTPException(status_code=422, detail="Etiqueta inválida.")
    if data.get("category_id"):
        cat = await db.categories.find_one({"id": data["category_id"]}, {"_id": 0})
        if not cat:
            raise HTTPException(status_code=404, detail="Categoria não encontrada.")
        data["category_name"] = cat["name"]
        data["category_slug"] = cat["slug"]
    if data.get("promo_price") is not None:
        price = data.get("price", doc["price"])
        if data["promo_price"] >= price:
            raise HTTPException(status_code=422, detail="O preço promocional deve ser menor que o preço.")
    if data.get("stock") is not None and data["stock"] < 0:
        raise HTTPException(status_code=422, detail="Estoque não pode ser negativo.")
    data["updated_at"] = utcnow()
    await db.products.update_one({"id": product_id}, {"$set": data})
    if data.get("image_file_id"):
        await _touch_product_images(product_id, data["image_file_id"], user["id"])
    fresh = await db.products.find_one({"id": product_id}, {"_id": 0})
    cats = await _category_map()
    return _product_out(fresh, cats)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, _: dict = Depends(require_recent_auth("admin"))) -> dict:
    result = await db.products.update_one({'id': product_id}, {'$set': {'archived': True, 'active': False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    await db.product_images.delete_many({"product_id": product_id})
    return {"ok": True}


# ---------------------------------------------------------------- categories
@router.get("/categories", response_model=list[Category])
async def admin_categories(_: dict = Depends(require_roles("admin"))) -> list[Category]:
    docs = await db.categories.find({}, {"_id": 0}).sort([("order", 1), ("name", 1)]).to_list(100)
    return [Category(**with_utc(doc)) for doc in docs]


@router.post("/categories", response_model=Category)
async def create_category(input: CategoryCreate, _: dict = Depends(require_recent_auth("admin"))) -> Category:
    slug = slugify(input.name)
    if await db.categories.find_one({"slug": slug}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Já existe uma categoria com este nome.")
    cat = Category(
        name=input.name.strip(),
        slug=slug,
        description=input.description,
        order=input.order,
        active=input.active,
        image_file_id=input.image_file_id,
    )
    await db.categories.insert_one(cat.model_dump())
    return cat


@router.patch("/categories/{category_id}", response_model=Category)
async def update_category(
    category_id: str, input: CategoryUpdate, _: dict = Depends(require_recent_auth("admin"))
) -> Category:
    doc = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    data = input.model_dump(exclude_unset=True)
    if data.get("name"):
        slug = slugify(data["name"])
        clash = await db.categories.find_one({"slug": slug, "id": {"$ne": category_id}}, {"_id": 0})
        if clash:
            raise HTTPException(status_code=409, detail="Já existe uma categoria com este nome.")
        data["slug"] = slug
        data["name"] = data["name"].strip()
    if data:
        await db.categories.update_one({"id": category_id}, {"$set": data})
    fresh = await db.categories.find_one({"id": category_id}, {"_id": 0})
    return Category(**with_utc(fresh))


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, _: dict = Depends(require_recent_auth("admin"))) -> dict:
    if await db.products.find_one({"category_id": category_id}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Existem produtos nesta categoria. Mova-os antes de excluir.")
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    return {"ok": True}


# ---------------------------------------------------------------- banners
@router.get("/indoor", response_model=list[Banner])
async def indoor_banners(_: dict = Depends(require_roles("admin", "atendente"))) -> list[Banner]:
    docs = await db.banners.find({"active": True, "image_file_id": {"$nin": [None, ""]}}, {"_id": 0}).sort([("order", 1), ("created_at", 1), ("id", 1)]).to_list(None)
    return [Banner(**with_utc(doc)) for doc in docs]


async def _validate_banner_image(file_id: str) -> None:
    image = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not image or image.get("content_type") not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        raise HTTPException(status_code=422, detail="Selecione uma imagem enviada pelo upload.")


@router.get("/banners", response_model=list[Banner])
async def admin_banners(_: dict = Depends(require_roles("admin"))) -> list[Banner]:
    docs = await db.banners.find({}, {"_id": 0}).sort([("order", 1), ("created_at", 1), ("id", 1)]).to_list(None)
    return [Banner(**with_utc(doc)) for doc in docs]


@router.post("/banners", response_model=Banner)
async def create_banner(input: BannerCreate, _: dict = Depends(require_recent_auth("admin"))) -> Banner:
    await _validate_banner_image(input.image_file_id)
    banner = Banner(**input.model_dump())
    await db.banners.insert_one(banner.model_dump())
    return banner


@router.patch("/banners/{banner_id}", response_model=Banner)
async def update_banner(
    banner_id: str, input: BannerUpdate, _: dict = Depends(require_recent_auth("admin"))
) -> Banner:
    doc = await db.banners.find_one({"id": banner_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Banner não encontrado.")
    data = input.model_dump(exclude_unset=True)
    if data:
        merged = {k: doc[k] for k in BannerCreate.model_fields if k in doc}
        merged.update(data)
        try:
            validated = BannerCreate(**merged)
        except ValidationError:
            raise HTTPException(status_code=422, detail="Confira título, imagem, ordem e link da promoção.")
        await _validate_banner_image(validated.image_file_id)
        await db.banners.update_one({"id": banner_id}, {"$set": {**validated.model_dump(), "updated_at": utcnow()}})
    fresh = await db.banners.find_one({"id": banner_id}, {"_id": 0})
    return Banner(**with_utc(fresh))


@router.delete("/banners/{banner_id}")
async def delete_banner(banner_id: str, _: dict = Depends(require_recent_auth("admin"))) -> dict:
    result = await db.banners.delete_one({"id": banner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Banner não encontrado.")
    return {"ok": True}


# ---------------------------------------------------------------- customers
@router.get("/customers", response_model=list[CustomerOut])
async def list_customers(_: dict = Depends(require_roles("admin"))) -> list[CustomerOut]:
    docs = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [
        CustomerOut(**with_utc({k: doc.get(k) for k in CUSTOMER_FIELDS}))
        for doc in docs
    ]


@router.patch("/customers/{user_id}", response_model=CustomerOut)
async def update_customer(
    user_id: str, input: CustomerUpdate, admin: dict = Depends(require_recent_auth("admin"))
) -> CustomerOut:
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Você não pode alterar o próprio perfil.")
    data = input.model_dump(exclude_unset=True)
    if data.get("role") and data["role"] not in ROLES:
        raise HTTPException(status_code=422, detail="Perfil inválido.")
    if data.get("status") and data["status"] not in ("ativo", "bloqueado"):
        raise HTTPException(status_code=422, detail="Status inválido.")
    before = await db.users.find_one({'id': user_id}, {'_id': 0, 'role': 1, 'status': 1})
    result = await db.users.update_one({"id": user_id}, {"$set": data, '$inc': {'token_version': 1}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0})
    if 'role' in data:
        audit_event('ROLE_CHANGE', actor_id=admin['id'], target_id=user_id,
                    details={'from': before.get('role') if before else None, 'to': data['role']})
    return CustomerOut(**with_utc({k: fresh.get(k) for k in CUSTOMER_FIELDS}))


# ---------------------------------------------------------------- orders
@router.get("/orders", response_model=list[Order])
async def admin_orders(_: dict = Depends(require_roles("admin", "atendente"))) -> list[Order]:
    docs = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [await _attach_items(doc) for doc in docs]


@router.patch("/orders/{order_id}", response_model=Order)
async def update_order(
    order_id: str, input: OrderStatusUpdate, _: dict = Depends(require_recent_auth("admin"))
) -> Order:
    if input.status not in ORDER_STATUS_LABELS:
        raise HTTPException(status_code=422, detail="Status inválido.")
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    transitions = {'aprovado': 'preparando', 'preparando': 'enviado', 'enviado': 'em_transito', 'em_transito': 'entregue'}
    if doc.get('payment_status') != 'pago' or transitions.get(doc['status']) != input.status:
        raise HTTPException(409, 'Transição de entrega inválida; pagamento confirmado é obrigatório.')
    result = await db.orders.update_one({'id': order_id, 'status': doc['status'], 'payment_status': 'pago'}, {'$set': {'status': input.status}})
    if not result.modified_count:
        raise HTTPException(409, 'O pedido foi alterado. Atualize a página.')
    doc["status"] = input.status
    return await _attach_items(doc)


@router.post('/payments/paypal/reconcile', response_model=Order)
async def reconcile_paypal_as_admin(
    input: PaypalCaptureIn, admin: dict = Depends(require_recent_auth('admin'))
) -> Order:
    order = await db.orders.find_one({'id': input.order_id}, {'_id': 0})
    if not order:
        raise HTTPException(404, 'Pedido nao encontrado.')
    return await _attach_items(await reconcile_payment(order, admin['id']))


# ---------------------------------------------------------------- stock
def _stock_row(doc: dict) -> StockRowOut:
    stock = doc.get("stock", 0)
    if stock <= 0:
        status = "sem_estoque"
    elif stock <= 5:
        status = "estoque_baixo"
    else:
        status = "em_estoque"
    return StockRowOut(
        id=doc["id"],
        name=doc["name"],
        sku=doc["sku"],
        stock=stock,
        active=doc.get("active", True),
        archived=doc.get("archived", False),
        status=status,
    )


@router.get("/stock", response_model=list[StockRowOut])
async def stock_rows(_: dict = Depends(require_roles("admin", "atendente"))) -> list[StockRowOut]:
    docs = await db.products.find({}, {"_id": 0}).sort([("stock", 1), ("name", 1)]).to_list(500)
    return [_stock_row(doc) for doc in docs]


@router.patch("/stock/{product_id}", response_model=StockRowOut)
async def set_stock(
    product_id: str, input: StockUpdate, _: dict = Depends(require_recent_auth("admin"))
) -> StockRowOut:
    if input.stock < 0:
        raise HTTPException(status_code=422, detail="Estoque não pode ser negativo.")
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    await db.products.update_one({"id": product_id}, {"$set": {"stock": input.stock, "updated_at": utcnow()}})
    doc["stock"] = input.stock
    return _stock_row(doc)


# ---------------------------------------------------------------- reports
@router.get("/reports", response_model=ReportOut)
async def reports(_: dict = Depends(require_roles("admin"))) -> ReportOut:
    pedidos_total = await db.orders.count_documents({})
    approved = await db.orders.find(
        {'payment_status': 'pago'},
        {"_id": 0},
    ).to_list(1000)
    vendas_total = round(sum(order.get("total", 0) for order in approved), 2)
    ticket_medio = round(vendas_total / len(approved), 2) if approved else None
    clientes_cadastrados = await db.users.count_documents({"role": "comprador"})

    top_docs = await db.order_items.aggregate(
        [
            {'$lookup': {'from': 'orders', 'localField': 'order_id', 'foreignField': 'id', 'as': 'order'}},
            {'$match': {'order.payment_status': 'pago'}},
            {"$group": {"_id": "$product_id", "qty": {"$sum": "$qty"}, "receita": {"$sum": {"$multiply": ["$unit_price", "$qty"]}}}},
            {"$sort": {"qty": -1}},
            {"$limit": 5},
        ]
    ).to_list(5)
    names = {p["id"]: p["name"] for p in await db.products.find({}, {"_id": 0}).to_list(500)}
    mais_vendidos = [
        TopProduct(product_id=t["_id"], name=names.get(t["_id"], "Produto removido"), qty=t["qty"], receita=round(t["receita"], 2))
        for t in top_docs
    ]

    status_docs = await db.orders.aggregate([{"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(20)
    por_status = [
        StatusCount(status=s["_id"], label=ORDER_STATUS_LABELS.get(s["_id"], s["_id"]), count=s["count"])
        for s in status_docs
    ]

    low_docs = (
        await db.products.find({"stock": {"$lte": 5}}, {"_id": 0})
        .sort([("stock", 1), ("name", 1)])
        .to_list(10)
    )
    return ReportOut(
        pedidos_total=pedidos_total,
        vendas_total=vendas_total,
        ticket_medio=ticket_medio,
        clientes_cadastrados=clientes_cadastrados,
        pedidos_por_status=por_status,
        produtos_mais_vendidos=mais_vendidos,
        estoque_baixo=[LowStockItem(**{k: d[k] for k in ("id", "name", "sku", "stock")}) for d in low_docs],
    )
