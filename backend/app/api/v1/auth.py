"""
api/v1/auth.py — POST /auth/login, GET /auth/me.

Login accepts the existing frontend's LoginRequest shape ({username,
password, rememberMe}) and returns the existing Session shape ({user,
token, expiresAt}) — see src/lib/api/auth.ts's own real fetch branch, which
already expects exactly this from `POST ${API_BASE}/auth/login`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.core.config import Settings, get_settings
from app.db.models import Profile
from app.db.session import get_db
from app.schemas.auth import LoginRequest, SessionResponse, UserResponse
from app.services.auth.supabase_auth import SupabaseAuthError, sign_in_with_password

router = APIRouter(tags=["auth"])


def _to_user_response(profile: Profile) -> UserResponse:
    return UserResponse(
        id=str(profile.id),
        username=profile.username,
        fullName=profile.full_name,
        email=profile.email,
        role=profile.role,
        department=profile.department or "",
        region=profile.region or "",
        # Placeholder until a real Jurisdiction table exists — see
        # schemas/auth.py's own comment on this field.
        jurisdictionId=profile.jurisdiction_name or "National",
        lastLoginAt=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/auth/login", response_model=SessionResponse)
def login(
    payload: LoginRequest,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    # The login form accepts a username or an email (01-login.md §2). Supabase's
    # password grant is email-only, so a bare username is resolved to its
    # mirrored profiles.email first (see user_profile.py's own docstring on
    # why that column exists).
    email = payload.username
    if "@" not in payload.username:
        profile_by_username = (
            db.query(Profile).filter(Profile.username == payload.username).first()
        )
        if profile_by_username is None:
            # Same generic message as a real wrong-password case — a login
            # endpoint must never confirm whether a username exists.
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
            )
        email = profile_by_username.email

    try:
        auth_result = sign_in_with_password(email, payload.password, settings)
    except SupabaseAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    user_id = auth_result.get("user", {}).get("id")
    try:
        profile = db.get(Profile, uuid.UUID(user_id)) if user_id else None
    except ValueError:
        profile = None

    if profile is None:
        # Authenticated by Supabase but no matching profiles row — a real
        # auth.users account, just not provisioned into DigiPramaan yet.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No profile is provisioned for this account",
        )

    expires_at = auth_result.get("expires_at")
    expires_at_iso = (
        datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat()
        if expires_at
        else datetime.now(timezone.utc).isoformat()
    )

    return SessionResponse(
        user=_to_user_response(profile),
        token=auth_result["access_token"],
        expiresAt=expires_at_iso,
    )


@router.get("/auth/me", response_model=UserResponse)
def me(current_user: Profile = Depends(get_current_user)) -> UserResponse:
    return _to_user_response(current_user)
