"""
health.py — liveness and readiness, deliberately kept separate.

GET /health        — liveness only. The process is running; no dependency
                      calls. Must never fail because Supabase or Backblaze
                      B2 had a transient blip, or an orchestrator would kill
                      and restart a perfectly healthy process for someone
                      else's problem.

GET /health/ready   — readiness. Checks Supabase Postgres and Backblaze B2;
                      200 only if both succeed, 503 naming the failed one
                      otherwise. No Redis/MinIO check — neither is part of
                      the MVP stack.
"""

import structlog
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.object_storage import get_s3_client
from app.db.session import SessionLocal

router = APIRouter(tags=["health"])
logger = structlog.get_logger("digipramaan.health")

# P2 hardening (2026-09-19, F-019): this route is unauthenticated by
# design (an orchestrator needs to call it with no credentials) — the raw
# exception text (connection strings, driver errors, B2 credential-
# adjacent detail) must never reach the response body. A small fixed
# reason-code vocabulary per check name is still genuinely useful to an
# orchestrator (it still says WHICH dependency is down), while the full
# text goes to the server-side log only.
_REASON_CODES = {
    "database": "database_unreachable",
    "object_storage": "storage_unreachable",
}


@router.get("/health")
def liveness() -> dict:
    return {"status": "ok"}


def _check_database() -> tuple[bool, str | None]:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True, None
    except SQLAlchemyError as exc:
        return False, str(exc)


def _check_object_storage() -> tuple[bool, str | None]:
    settings = get_settings()
    try:
        get_s3_client(settings, fast_fail=True).head_bucket(Bucket=settings.s3_bucket)
        return True, None
    except (BotoCoreError, ClientError) as exc:
        return False, str(exc)


@router.get("/health/ready")
def readiness(response: Response) -> dict:
    checks = {
        "database": _check_database(),
        "object_storage": _check_object_storage(),
    }
    for name, (ok, error) in checks.items():
        if not ok:
            logger.warning("readiness_check_failed", check=name, error=error)

    all_ok = all(ok for ok, _ in checks.values())
    response.status_code = status.HTTP_200_OK if all_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ready" if all_ok else "not_ready",
        "checks": {
            name: {"ok": ok, **({"reason": _REASON_CODES[name]} if not ok else {})}
            for name, (ok, _error) in checks.items()
        },
    }
