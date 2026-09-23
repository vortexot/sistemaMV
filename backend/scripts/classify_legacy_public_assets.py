"""Classify only legacy uploads referenced by known image fields.

Dry-run is the default. Run from ``backend`` with ``--apply`` only after reviewing
the counts and after a database/filesystem backup.
"""

import argparse
import asyncio
from pathlib import Path

from lib.db import client, db
from routers.files import STORAGE_DIR


REFERENCES = (
    ("products", "image_file_id"),
    ("categories", "image_file_id"),
    ("banners", "image_file_id"),
    ("product_images", "file_id"),
)


async def referenced_file_ids() -> set[str]:
    ids: set[str] = set()
    for collection, field in REFERENCES:
        rows = await db[collection].find(
            {field: {"$type": "string", "$ne": ""}}, {"_id": 0, field: 1}
        ).to_list(None)
        ids.update(row[field] for row in rows if row.get(field))
    return ids


async def run(apply: bool) -> None:
    referenced = await referenced_file_ids()
    candidates = await db.files.find(
        {"id": {"$in": list(referenced)}, "access": {"$exists": False}, "is_deleted": False},
        {"_id": 0, "id": 1, "storage_path": 1},
    ).to_list(None)

    storage_root = STORAGE_DIR.resolve()
    safe_ids: list[str] = []
    for row in candidates:
        path = Path(row.get("storage_path", ""))
        try:
            safe = path.resolve().is_relative_to(storage_root) and path.is_file()
        except (OSError, RuntimeError):
            safe = False
        if safe:
            safe_ids.append(row["id"])

    unknown = await db.files.count_documents({"access": {"$exists": False}, "is_deleted": False})
    print(f"referenced={len(referenced)} eligible={len(safe_ids)} unclassified_total={unknown}")
    if not apply:
        print("dry-run: no records changed; review the counts and rerun with --apply")
        return

    result = await db.files.update_many(
        {"id": {"$in": safe_ids}, "access": {"$exists": False}, "is_deleted": False},
        {"$set": {"access": "public_asset"}},
    )
    print(f"classified={result.modified_count}; unrelated records remain private")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write the reviewed classification")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.apply))
    finally:
        client.close()
