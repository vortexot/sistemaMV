"""Public image assets only. Private documents must use a separate authorized flow."""

import os
import uuid
import hashlib
import warnings
from io import BytesIO
from PIL import Image, UnidentifiedImageError
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from gridfs.errors import NoFile
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from lib.db import db
from lib.security import require_recent_auth
from models.files import FileOut

router = APIRouter(prefix="/files")

STORAGE_DIR = Path(
    os.environ.get("STORAGE_DIR") or Path(__file__).resolve().parent.parent / "storage" / "uploads"
)
MAX_SIZE = 8 * 1024 * 1024  # 8 MB
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
EXT_BY_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}


def storage_backend() -> str:
    return os.getenv("STORAGE_BACKEND", "filesystem").strip().lower()


def _gridfs_bucket(database):
    return AsyncIOMotorGridFSBucket(database, bucket_name="uploads")


async def stored_file_exists(database, doc: dict) -> bool:
    if doc.get("storage_backend", "filesystem") == "gridfs":
        key = doc.get("storage_key") or doc.get("id")
        return bool(await database["uploads.files"].find_one({"_id": key}, {"_id": 1}))
    path = Path(doc.get("storage_path", ""))
    if not path.name:
        return False
    try:
        return path.resolve().is_relative_to(STORAGE_DIR.resolve()) and path.is_file()
    except (OSError, RuntimeError):
        return False


async def store_bytes(database, file_id: str, ext: str, data: bytes, *, content_type: str) -> dict:
    if storage_backend() == "gridfs":
        await _gridfs_bucket(database).upload_from_stream_with_id(
            file_id,
            f"{file_id}{ext}",
            data,
            metadata={"content_type": content_type},
        )
        return {
            "storage_backend": "gridfs",
            "storage_key": file_id,
            "storage_path": f"gridfs://uploads/{file_id}",
        }

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    path = STORAGE_DIR / f"{file_id}{ext}"
    path.write_bytes(data)
    return {"storage_backend": "filesystem", "storage_path": str(path)}


async def delete_stored_bytes(database, storage: dict) -> None:
    if storage.get("storage_backend") == "gridfs":
        try:
            await _gridfs_bucket(database).delete(storage["storage_key"])
        except NoFile:
            pass
        return
    path_value = storage.get("storage_path")
    if path_value:
        Path(path_value).unlink(missing_ok=True)


async def load_stored_bytes(database, doc: dict) -> bytes | None:
    if doc.get("storage_backend", "filesystem") != "gridfs":
        return None
    try:
        stream = await _gridfs_bucket(database).open_download_stream(doc.get("storage_key") or doc["id"])
    except NoFile:
        return None
    return await stream.read()


@router.post("/upload", response_model=FileOut)
async def upload_file(file: UploadFile, user: dict = Depends(require_recent_auth("admin"))) -> FileOut:
    data = await file.read(MAX_SIZE + 1)
    if not data:
        raise HTTPException(status_code=422, detail="Arquivo vazio.")
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Imagem acima do limite de 8 MB.")

    original = (file.filename or "").replace("\\", "/").split("/")[-1].strip()
    if not original:
        raise HTTPException(status_code=422, detail="Nome de arquivo inválido.")
    ext = Path(original).suffix.lower()
    mime = (file.content_type or "").lower().split(";")[0].strip()

    if mime in EXT_BY_MIME:
        if ext not in ALLOWED_EXTS:
            ext = EXT_BY_MIME[mime]
    elif ext in ALLOWED_EXTS:
        mime = MIME_BY_EXT.get(ext, "application/octet-stream")
    else:
        raise HTTPException(
            status_code=415,
            detail="Formato não suportado. Envie JPG, JPEG, PNG, WEBP ou GIF.",
        )

    # Decode the contents: neither a filename nor a client MIME type proves this is an image.
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                actual_mime = Image.MIME.get(image.format)
                if actual_mime not in ALLOWED_MIME or image.width * image.height > 40_000_000:
                    raise ValueError("Unsupported image")
                image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=415, detail="Imagem inválida. Use JPG, PNG, WEBP ou GIF de até 40 megapixels.")
    mime = actual_mime
    ext = EXT_BY_MIME[mime]
    digest = hashlib.sha256(data).hexdigest()
    existing = await db.files.find_one({"sha256": digest, "is_deleted": False}, {"_id": 0})
    if existing and await stored_file_exists(db, existing):
        return FileOut(**existing)

    file_id = str(uuid.uuid4())  # unique path: uuid is the filename, never the original name
    storage = await store_bytes(db, file_id, ext, data, content_type=mime)

    doc = {
        "id": file_id,
        "sha256": digest,
        **storage,
        "original_filename": original,
        "content_type": mime,
        "size": len(data),
        "uploaded_by": user["id"],
        "access": "public_asset",
        "created_at": datetime.now(timezone.utc),
        "is_deleted": False,
    }
    try:
        await db.files.insert_one(doc)
    except BaseException:
        await delete_stored_bytes(db, storage)
        raise
    return FileOut(**doc)


@router.get("/{file_id}")
async def get_file(file_id: str):
    doc = await db.files.find_one(
        {
            "id": file_id,
            "is_deleted": False,
            "access": "public_asset",
        },
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    if doc.get("storage_backend") == "gridfs":
        data = await load_stored_bytes(db, doc)
        if data is None:
            raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
        return Response(
            content=data,
            media_type=doc["content_type"],
            headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
        )

    path = Path(doc.get("storage_path", ""))
    if not path.resolve().is_relative_to(STORAGE_DIR.resolve()) or not path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return FileResponse(
        path,
        media_type=doc["content_type"],
        headers={"Cache-Control": "public, max-age=31536000, immutable", 'X-Content-Type-Options': 'nosniff'},
    )
