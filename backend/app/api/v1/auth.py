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

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.core.client_ip import resolve_client_ip
from app.core.config import Settings, get_settings
from app.db.models import Profile
from app.db.session import get_db
from app.schemas.auth import LoginRequest, RefreshRequest, SessionResponse, UserResponse
from app.services.audit.emit import emit
from app.services.auth.rate_limit import check_and_increment
from app.services.auth.supabase_auth import (
    SupabaseAuthError,
    refresh_access_token,
    sign_in_with_password,
)

router = APIRouter(tags=["auth"])


def _rate_limit_or_raise(
    db: DbSession, *, keys: list[str], window_seconds: int, max_hits: int, event_type: str, detail: dict
) -> None:
    """P2 hardening (F-010): any one of `keys` tripping its own bucket is
    a 429 — e.g. login checks both the caller's IP and the submitted
    email, so a distributed attack against one account and a
    concentrated attack from one source are both caught. Emits ONE
    AuditEvent per rejection (not per attempt, which would be high-volume
    noise) in the request's own session, committed immediately since this
    function is about to raise."""
    for key in keys:
        if not check_and_increment(key, window_seconds=window_seconds, max_hits=max_hits):
            emit(db, event_type, detail={**detail, "bucketKey": key})
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Try again shortly.",
                headers={"Retry-After": str(window_seconds)},
            )


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


def _session_response_from_auth_result(auth_result: dict, db: DbSession) -> SessionResponse:
    """Shared by /auth/login and /auth/refresh — both end up holding a
    Supabase token-endpoint response in the same shape and need to turn it
    into this app's own SessionResponse (profile lookup + camelCase
    fields), so this is the one place that translation happens."""
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
        refreshToken=auth_result["refresh_token"],
        expiresAt=expires_at_iso,
    )


@router.post("/auth/login", response_model=SessionResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    client_ip = resolve_client_ip(request, settings)
    _rate_limit_or_raise(
        db,
        keys=[
            f"login:ip:{client_ip}",
            f"login:email:{payload.username.strip().lower()}",
        ],
        window_seconds=settings.auth_login_rate_limit_window_seconds,
        max_hits=settings.auth_login_rate_limit_max_attempts,
        event_type="login_rate_limited",
        detail={"clientIp": client_ip},
    )

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

    return _session_response_from_auth_result(auth_result, db)


@router.post("/auth/refresh", response_model=SessionResponse)
def refresh(
    payload: RefreshRequest,
    request: Request,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    """WCAG 2.2.1 / BRD A-11: called by the frontend's pre-expiry warning
    banner's "Stay signed in" action, before the current access token
    expires. Never requires the caller to already be authenticated with a
    valid access token — the whole point is that the access token may be
    about to (or already did) expire; the refresh token is the only
    credential this endpoint trusts."""
    client_ip = resolve_client_ip(request, settings)
    _rate_limit_or_raise(
        db,
        keys=[f"refresh:ip:{client_ip}"],
        window_seconds=settings.auth_refresh_rate_limit_window_seconds,
        max_hits=settings.auth_refresh_rate_limit_max_attempts,
        event_type="refresh_rate_limited",
        detail={"clientIp": client_ip},
    )

    try:
        auth_result = refresh_access_token(payload.refresh_token, settings)
    except SupabaseAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _session_response_from_auth_result(auth_result, db)


@router.get("/auth/me", response_model=UserResponse)
def me(current_user: Profile = Depends(get_current_user)) -> UserResponse:
    return _to_user_response(current_user)
