"""File upload models. storage_path never leaves the backend."""

from datetime import datetime
import uuid

from pydantic import BaseModel, Field

from lib.dates import utcnow


class FileMeta(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    storage_path: str
    original_filename: str
    content_type: str
    size: int
    uploaded_by: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    is_deleted: bool = False


class FileOut(BaseModel):
    id: str
    original_filename: str
    content_type: str
    size: int
    created_at: datetime
