"""
deps/auth.py — get_current_user(), the one dependency every protected
endpoint depends on (directly, or transitively through deps/permissions.py).

Bearer token -> cryptographic verification -> load the matching `profiles`
row. Never trusts a client-supplied userId/viewerId anywhere in this chain
— the only identity input is the token itself.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import AuthError, verify_supabase_jwt
from app.db.models import Profile
from app.db.session import get_db

# auto_error=False so a missing token reaches our own handler as `None`
# rather than FastAPI's generic 403 — we want a consistent 401 for every
# authentication failure, missing token included.
_bearer_scheme = HTTPBearer(auto_error=False)


def _resolve_profile(token: str, db: Session, settings: Settings) -> Profile:
    try:
        claims = verify_supabase_jwt(token, settings)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    try:
        user_id = uuid.UUID(claims["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token subject is malformed"
        ) from exc

    profile = db.get(Profile, user_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No profile is provisioned for this account",
        )

    return profile


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Profile:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _resolve_profile(credentials.credentials, db, settings)


def get_current_user_from_bearer_or_query(
    access_token: str | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Profile:
    """Phase 5 report-download-only variant. The existing download UX is a
    plain `<a href>` (kept unchanged deliberately — see Phase 5's own
    report), which cannot attach an Authorization header, so this accepts
    the SAME token as a `?access_token=` query param when no header is
    present. Never used anywhere else — a token in a URL is a real MVP
    tradeoff (browser history, server logs), documented rather than hidden,
    and a hardening pass should replace it with a short-lived signed
    download ticket instead of the raw session token."""
    token = credentials.credentials if credentials is not None else access_token
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token or access_token query param",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _resolve_profile(token, db, settings)
