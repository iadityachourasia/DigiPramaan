"""
schemas/auth.py — mirrors src/types/user.ts's `User`/`Session` exactly
(camelCase field names via alias) so the existing login page and its
`Session` type need zero changes once this endpoint is live.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str
    password: str
    rememberMe: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str = Field(alias="refreshToken")

    model_config = ConfigDict(populate_by_name=True)


class UserResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    username: str
    full_name: str = Field(alias="fullName")
    email: str
    role: str
    department: str
    region: str
    # No Jurisdiction table in the MVP backend yet (long-term design's job —
    # see deps/permissions.py's Scope). Placeholder: the jurisdiction name
    # itself, standing in for a real id until that table exists.
    jurisdiction_id: str = Field(alias="jurisdictionId")
    last_login_at: str = Field(alias="lastLoginAt")


class SessionResponse(BaseModel):
    user: UserResponse
    token: str
    # Used only to call POST /auth/refresh before this session's own token
    # expires (WCAG 2.2.1 / BRD A-11) — never sent anywhere except back to
    # this same endpoint. Supabase rotates it on every refresh, so the
    # frontend must always store whichever one came back most recently.
    refresh_token: str = Field(alias="refreshToken", serialization_alias="refreshToken")
    expires_at: str = Field(alias="expiresAt", serialization_alias="expiresAt")

    model_config = ConfigDict(populate_by_name=True)
