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

    try:
        claims = verify_supabase_jwt(credentials.credentials, settings)
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
