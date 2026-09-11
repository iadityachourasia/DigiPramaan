"""
api/deps/mobile_handoff.py — resolves a raw handoff token into its
`MobileUploadSession` row.

Genuinely new pattern in this codebase: `get_current_user`/
`require_permission` (deps/auth.py, deps/permissions.py) both hard-require
a Supabase-JWT-backed `Profile`. A phone that scanned a QR code has no
login at all — this dependency is the ONLY thing that authenticates it,
and it authenticates against a `MobileUploadSession` row, never a
`Profile`. It is wired into exactly the 3 token-scoped routes in
api/v1/mobile_handoff.py — no other route depends on it, so it grants no
access anywhere else by construction.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from app.db.models import MobileUploadSession
from app.db.session import get_db
from app.services.mobile_handoff.tokens import hash_token


def get_active_handoff(
    token: str,
    db: DbSession = Depends(get_db),
) -> MobileUploadSession:
    """404 (never 401/403) on every failure — invalid token, expired,
    revoked, or already completed all read the same to a caller, matching
    `get_evidence_image`'s own "don't let a probe distinguish wrong-scope
    from doesn't-exist" precedent. A lazily-expired ACTIVE session is
    flipped to EXPIRED here rather than waiting on a cleanup job."""
    handoff = (
        db.query(MobileUploadSession)
        .filter(MobileUploadSession.token_hash == hash_token(token))
        .first()
    )
    if handoff is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired upload session"
        )

    if handoff.status == "ACTIVE" and handoff.expires_at < datetime.now(timezone.utc):
        handoff.status = "EXPIRED"
        db.commit()

    if handoff.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired upload session"
        )

    return handoff
