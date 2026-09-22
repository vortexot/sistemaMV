"""Idempotent MongoDB -> Supabase PostgreSQL data migration.

Required environment variable:
  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres

The script never prints credentials or row values. It creates the schema and upserts
only allowlisted fields. Local upload binaries remain local; their metadata is migrated.
"""

from __future__ import annotations

import argparse
import asyncio
import math
import os
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from lib.db import db  # noqa: E402


TABLES: dict[str, tuple[str, ...]] = {
    "users": ("id", "name", "email", "password_hash", "role", "status", "picture", "token_version", "created_at"),
    "files": ("id", "sha256", "storage_path", "original_filename", "content_type", "size", "uploaded_by", "seed_key", "created_at", "is_deleted"),
    "categories": ("id", "name", "slug", "description", "order", "active", "image_file_id", "created_at"),
    "products": ("id", "name", "sku", "brand", "category_id", "price", "promo_price", "stock", "sizes", "colors", "description", "tag", "featured", "active", "archived", "image_file_id", "created_at", "updated_at"),
    "product_images": ("id", "product_id", "file_id", "is_main", "uploaded_by", "created_at"),
    "banners": ("id", "title", "subtitle", "image_file_id", "active", "order", "link", "alt_text", "created_at", "updated_at"),
    "orders": ("id", "number", "user_id", "customer_name", "customer_email", "items_total", "total", "status", "payment_method", "payment_status", "paypal_order_id", "paid_at", "created_at", "idempotency_key", "request_hash"),
    "order_items": ("id", "order_id", "product_id", "name", "sku", "unit_price", "qty"),
    "favorites": ("id", "user_id", "product_id", "created_at"),
    "password_reset_tokens": ("token", "user_id", "token_version", "used", "created_at", "expires_at"),
    "auth_limits": ("id", "count", "expires_at"),
    "revoked_tokens": ("jti", "expires_at", "revoked_at"),
}

PRIMARY_KEYS = {
    "users": "id", "files": "id", "categories": "id", "products": "id",
    "product_images": "id", "banners": "id", "orders": "id",
    "order_items": "id", "favorites": "id", "password_reset_tokens": "token",
    "auth_limits": "id", "revoked_tokens": "jti",
}

DEFAULTS: dict[str, dict[str, Any]] = {
    "files": {"sha256": None, "seed_key": None, "uploaded_by": None},
    "banners": {"order": 0, "link": "", "alt_text": "", "updated_at": None},
}


async def read_source() -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for table, fields in TABLES.items():
        projection = {field if field != "id" or table != "auth_limits" else "_id": 1 for field in fields}
        projection["_id"] = 0 if table != "auth_limits" else 1
        docs = await db[table].find({}, projection).to_list(None)
        rows = []
        for doc in docs:
            if table == "auth_limits":
                doc["id"] = str(doc.pop("_id"))
            row = {field: doc.get(field, DEFAULTS.get(table, {}).get(field)) for field in fields}
            if table == "banners" and row["updated_at"] is None:
                row["updated_at"] = row["created_at"]
            rows.append(row)
        result[table] = rows
    return result


def upsert_rows(conn: psycopg.Connection, table: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    fields = TABLES[table]
    key = PRIMARY_KEYS[table]
    updates = [field for field in fields if field != key]
    statement = sql.SQL("insert into mv.{} ({}) values ({}) on conflict ({}) do update set {}").format(
        sql.Identifier(table),
        sql.SQL(", ").join(map(sql.Identifier, fields)),
        sql.SQL(", ").join(sql.Placeholder() for _ in fields),
        sql.Identifier(key),
        sql.SQL(", ").join(
            sql.SQL("{} = excluded.{}").format(sql.Identifier(field), sql.Identifier(field))
            for field in updates
        ),
    )
    conn.executemany(statement, [tuple(row[field] for field in fields) for row in rows])


def sql_literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return sql_literal(value.isoformat()) + "::timestamptz"
    if isinstance(value, (int, Decimal)):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Valor numérico não finito na origem.")
        return repr(value)
    if isinstance(value, list):
        return "array[" + ", ".join(sql_literal(str(item)) for item in value) + "]::text[]"
    if isinstance(value, str):
        if "\x00" in value:
            raise ValueError("Texto com byte nulo não pode ser migrado para PostgreSQL.")
        return "'" + value.replace("'", "''") + "'"
    raise TypeError(f"Tipo não suportado na exportação: {type(value).__name__}")


def export_sql(rows: dict[str, list[dict[str, Any]]], output: Path) -> None:
    lines = ["begin;"]
    for table, table_rows in rows.items():
        fields = TABLES[table]
        key = PRIMARY_KEYS[table]
        quoted_fields = ", ".join(f'"{field}"' for field in fields)
        updates = ", ".join(
            f'"{field}" = excluded."{field}"' for field in fields if field != key
        )
        for row in table_rows:
            values = ", ".join(sql_literal(row[field]) for field in fields)
            lines.append(
                f'insert into mv."{table}" ({quoted_fields}) values ({values}) '
                f'on conflict ("{key}") do update set {updates};'
            )
    lines.extend(["commit;", ""])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines), encoding="utf-8")
    print(f"SQL local gerado: {output} ({sum(map(len, rows.values()))} registro(s))")


def apply(rows: dict[str, list[dict[str, Any]]], database_url: str) -> None:
    schema = (ROOT / "supabase" / "migrations" / "001_initial_schema.sql").read_text(encoding="utf-8")
    with psycopg.connect(database_url, connect_timeout=15) as conn:
        conn.execute(schema)
        for table, table_rows in rows.items():
            upsert_rows(conn, table, table_rows)
            print(f"{table}: {len(table_rows)} registro(s)")
        conn.commit()


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Inventaria a origem sem conectar ao Supabase.")
    parser.add_argument("--export-sql", type=Path, help="Gera SQL local sem conectar ao Supabase.")
    args = parser.parse_args()
    rows = await read_source()
    if args.check:
        for table, table_rows in rows.items():
            print(f"{table}: {len(table_rows)} registro(s)")
        return
    if args.export_sql:
        export_sql(rows, args.export_sql)
        return
    database_url = os.getenv("SUPABASE_DB_URL", "").strip()
    if not database_url:
        raise SystemExit("Defina SUPABASE_DB_URL no ambiente; nenhum dado foi enviado.")
    await asyncio.to_thread(apply, rows, database_url)
    print("Migração concluída sem remover dados da origem.")


if __name__ == "__main__":
    asyncio.run(main())
