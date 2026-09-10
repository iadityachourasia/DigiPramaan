"""
api/v1/internal.py — Phase 1 validation only.

`GET /internal/whoami` proves the full get_current_user() chain end to end
(valid token -> profile). `GET /internal/admin-check` proves the permission
layer's 403 path specifically (an authenticated but under-permissioned
user must be refused). Neither returns anything beyond what the caller
already knows about themselves — no internal debug detail.

Remove both once real domain endpoints (Phase 2+) exercise the same paths
naturally.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps.auth import get_current_user
from app.api.deps.permissions import require_permission
from app.db.models import Profile

router = APIRouter(tags=["internal"], prefix="/internal")


@router.get("/whoami")
def whoami(current_user: Profile = Depends(get_current_user)) -> dict:
    return {"id": str(current_user.id), "role": current_user.role}


@router.get("/admin-check")
def admin_check(
    current_user: Profile = Depends(require_permission("rules.manageThresholds")),
) -> dict:
    return {"ok": True, "role": current_user.role}
