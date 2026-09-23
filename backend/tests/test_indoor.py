"""Isolated endpoint tests: real validation/RBAC, no live database writes."""
import os
import time
from io import BytesIO
from types import SimpleNamespace

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "indoor_tests")

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from PIL import Image
from lib.security import get_current_user
from routers import admin, catalog, files


class Collection:
    def __init__(self):
        self.docs = []

    def matches(self, doc, query):
        return all(doc.get(k) not in v["$nin"] if isinstance(v, dict) else doc.get(k) == v for k, v in query.items())

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def find_one(self, query, *args):
        return next((dict(d) for d in self.docs if self.matches(d, query)), None)

    def find(self, query, *args):
        rows = [dict(d) for d in self.docs if self.matches(d, query)]
        class Cursor:
            def sort(self, keys):
                rows.sort(key=lambda d: tuple(d.get(k, 0) for k, _ in keys))
                return self
            async def to_list(self, limit):
                return rows if limit is None else rows[:limit]
        return Cursor()

    async def update_one(self, query, changes):
        for doc in self.docs:
            if self.matches(doc, query):
                doc.update(changes["$set"])

    async def delete_one(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not self.matches(d, query)]
        return SimpleNamespace(deleted_count=before - len(self.docs))


@pytest.fixture
def indoor(monkeypatch, tmp_path):
    database = SimpleNamespace(banners=Collection(), files=Collection())
    for module in (admin, catalog, files):
        monkeypatch.setattr(module, "db", database)
    monkeypatch.setattr(files, "STORAGE_DIR", tmp_path)
    app = FastAPI()
    for router in (admin.router, catalog.router, files.router):
        app.include_router(router, prefix="/api")
    async def current_user(request: Request):
        request.state.auth_payload = {"reauth_at": int(time.time()), "mfa": False}
        return {"id": "admin", "role": "admin", "mfa_enabled": False}
    app.dependency_overrides[get_current_user] = current_user
    with TestClient(app) as client:
        yield client, app, database


def upload(client):
    buffer = BytesIO()
    Image.new("RGB", (32, 18), "gold").save(buffer, format="PNG")
    response = client.post("/api/files/upload", files={"file": ("banner.png", buffer.getvalue(), "image/png")})
    assert response.status_code == 200
    return response.json()["id"]


def test_crud_order_active_and_empty(indoor):
    client, _, _ = indoor
    image_id = upload(client)
    payload = {"title": "Oferta", "image_file_id": image_id, "order": 8, "alt_text": "Oferta dourada"}
    first = client.post("/api/admin/banners", json=payload).json()
    second = client.post("/api/admin/banners", json={**payload, "order": 1}).json()
    assert [b["id"] for b in client.get("/api/admin/indoor").json()] == [second["id"], first["id"]]
    response = client.patch(f'/api/admin/banners/{first["id"]}', json={"title": "Nova oferta", "order": 0, "link": "/carrinho"})
    assert response.status_code == 200
    assert response.json()["updated_at"] >= first["created_at"]
    assert client.get("/api/admin/indoor").json()[0]["id"] == first["id"]
    client.patch(f'/api/admin/banners/{first["id"]}', json={"active": False})
    assert len(client.get("/api/admin/indoor").json()) == 1
    client.patch(f'/api/admin/banners/{first["id"]}', json={"active": True})
    assert len(client.get("/api/admin/indoor").json()) == 2
    for banner in (first, second):
        assert client.delete(f'/api/admin/banners/{banner["id"]}').status_code == 200
    assert client.get("/api/admin/indoor").json() == []
    assert client.delete(f'/api/admin/banners/{first["id"]}').status_code == 404


@pytest.mark.parametrize("changes", [{"title": "  "}, {"order": -1}, {"link": "javascript:alert(1)"}, {"link": "//evil.test"}, {"link": "/\\evil.test"}, {"image_file_id": "missing"}, {"active": None}])
def test_invalid_create_and_patch(indoor, changes):
    client, _, _ = indoor
    payload = {"title": "Oferta", "image_file_id": upload(client)}
    banner = client.post("/api/admin/banners", json=payload).json()
    assert client.post("/api/admin/banners", json={**payload, **changes}).status_code == 422
    assert client.patch(f'/api/admin/banners/{banner["id"]}', json=changes).status_code == 422


def test_upload_validation_and_deduplication(indoor):
    client, _, database = indoor
    assert upload(client) == upload(client)
    assert len(database.files.docs) == 1
    for data, expected in [(b"", 422), (b"<script>bad</script>", 415), (b"x" * (files.MAX_SIZE + 1), 413)]:
        assert client.post("/api/files/upload", files={"file": ("fake.png", data, "image/png")}).status_code == expected


@pytest.mark.parametrize("role", ["atendente", "comprador"])
def test_non_admin_cannot_write(indoor, role):
    client, app, _ = indoor
    app.dependency_overrides[get_current_user] = lambda: {"id": "other", "role": role}
    assert client.get("/api/admin/banners").status_code == 403
    assert client.delete("/api/admin/banners/anything").status_code == 403
    assert client.post("/api/files/upload", files={"file": ("a.png", b"bad", "image/png")}).status_code == 403


def test_anonymous_cannot_manage(indoor):
    client, app, _ = indoor
    app.dependency_overrides.clear()
    assert client.get("/api/admin/banners").status_code == 401
    assert client.get("/api/admin/indoor").status_code == 401
    assert client.get("/api/catalog/banners").status_code == 404


@pytest.mark.parametrize("role,expected", [("admin", 200), ("atendente", 200), ("comprador", 403)])
def test_presentation_requires_staff_access(indoor, role, expected):
    client, app, _ = indoor
    app.dependency_overrides[get_current_user] = lambda: {"id": "viewer", "role": role}
    assert client.get("/api/admin/indoor").status_code == expected
