import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()  # Uniqueness and revocation indexes are security prerequisites.
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    return []

# Feature routers — each module exports its own APIRouter; all land under /api.
from routers import admin, auth, catalog, favorites, files, orders

api_router.include_router(auth.router)
api_router.include_router(catalog.router)
api_router.include_router(favorites.router)
api_router.include_router(files.router)
api_router.include_router(orders.router)
api_router.include_router(admin.router)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[x.strip() for x in os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(',') if x.strip() != '*'],
    allow_methods=['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allow_headers=['Content-Type', 'Authorization', 'Idempotency-Key'],
)

from lib.http_security import HttpSecurity
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
app.add_middleware(HttpSecurity)

@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Pydantic errors may contain the submitted password/token in `input`.
    return JSONResponse({'detail': 'Confira os campos informados.'}, status_code=422)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
