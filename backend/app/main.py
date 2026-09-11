"""
main.py — FastAPI app factory.

Wires: CORS, the request-ID/logging middleware, the standard error-envelope
exception handlers, and the /api/v1 routers (health, auth, internal). No
lifespan-managed OCR/job-queue resources yet — the DB client is constructed
lazily, only when needed. The one exception is object storage: when
`s3_auto_create_bucket` is enabled (the local/dev default), the startup hook
idempotently creates the configured bucket so a fresh environment is
self-sufficient with no manual bucket-creation step — this never raises, so
a briefly-unavailable endpoint cannot crash app boot; /health/ready is what
reports that, not startup. Hosted MVP deployment (Backblaze B2 with a
bucket-scoped application key) sets the flag off, since such a key typically
has no create-bucket permission at all and the bucket is created once, out
of band, in the B2 console.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.auth import router as auth_router
from app.api.v1.cases import router as cases_router
from app.api.v1.companies import router as companies_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.ecommerce import router as ecommerce_router
from app.api.v1.explanations import router as explanations_router
from app.api.v1.health import router as health_router
from app.api.v1.internal import router as internal_router
from app.api.v1.products import router as products_router
from app.api.v1.reports import router as reports_router
from app.api.v1.records import router as records_router
from app.api.v1.scans import router as scans_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import RequestIdMiddleware, configure_logging
from app.core.object_storage import ensure_bucket_exists


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.s3_auto_create_bucket:
        ensure_bucket_exists(settings)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title="DigiPramaan Backend", version="0.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIdMiddleware)

    register_exception_handlers(app)

    app.include_router(health_router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(internal_router, prefix="/api/v1")
    app.include_router(scans_router, prefix="/api/v1")
    app.include_router(ecommerce_router, prefix="/api/v1")
    app.include_router(records_router, prefix="/api/v1")
    app.include_router(products_router, prefix="/api/v1")
    app.include_router(companies_router, prefix="/api/v1")
    app.include_router(cases_router, prefix="/api/v1")
    app.include_router(dashboard_router, prefix="/api/v1")
    app.include_router(reports_router, prefix="/api/v1")
    app.include_router(explanations_router, prefix="/api/v1")

    return app


app = create_app()
