"""
supabase_auth.py — the one place this backend calls Supabase Auth's REST
API. Only used for the password-grant login exchange; every subsequent
request is verified locally (see app/core/security.py) rather than round-
tripping to Supabase again.

Uses the anon/public key, never the service-role key — see
app/core/config.py's own comment on why. The anon key identifies this
backend as a caller, not the end user; the user's own identity comes from
their password, verified by Supabase itself.
"""

from __future__ import annotations

import httpx


class SupabaseAuthError(Exception):
    def __init__(self, message: str, status_code: int = 401) -> None:
        self.status_code = status_code
        super().__init__(message)


def sign_in_with_password(email: str, password: str, settings) -> dict:
    """Returns Supabase's raw token response
    ({access_token, expires_at, refresh_token, user: {...}}) on success.
    Raises SupabaseAuthError (401) on wrong credentials, or (503) if the
    auth service itself could not be reached — a caller must not confuse
    the two: a network failure is not proof the password was wrong.
    """
    url = f"{settings.resolved_supabase_url}/auth/v1/token"
    headers = {
        "apikey": settings.supabase_anon_key,
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(
            url,
            params={"grant_type": "password"},
            headers=headers,
            json={"email": email, "password": password},
            timeout=8.0,
        )
    except httpx.HTTPError as exc:
        raise SupabaseAuthError(
            "Could not reach the authentication service", status_code=503
        ) from exc

    if response.status_code in (400, 401):
        raise SupabaseAuthError("Invalid username or password", status_code=401)
    if response.status_code != 200:
        raise SupabaseAuthError(
            f"Authentication service returned an unexpected status: {response.status_code}",
            status_code=503,
        )

    return response.json()


def create_user_as_admin(email: str, password: str, settings) -> dict:
    """Creates a Supabase Auth user via the Admin API — the one call in this
    module that uses the service-role key instead of the anon key, since
    Supabase has no lesser-privileged way to create an account. Only ever
    called from the Admin Console's create-user endpoint, itself gated to
    Admin role. Returns Supabase's raw user object ({id, email, ...}) on
    success. Raises SupabaseAuthError(409) if the email is already
    registered, or (503) if the key is missing or the service can't be
    reached — a caller must not confuse "already exists" with "failed"."""
    if settings.supabase_service_role_key is None:
        raise SupabaseAuthError(
            "User creation is not configured on this server (no service-role key)",
            status_code=503,
        )

    url = f"{settings.resolved_supabase_url}/auth/v1/admin/users"
    service_key = settings.supabase_service_role_key.get_secret_value()
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(
            url,
            headers=headers,
            json={"email": email, "password": password, "email_confirm": True},
            timeout=8.0,
        )
    except httpx.HTTPError as exc:
        raise SupabaseAuthError(
            "Could not reach the authentication service", status_code=503
        ) from exc

    if response.status_code in (400, 422) and "already been registered" in response.text.lower():
        raise SupabaseAuthError("An account with this email already exists", status_code=409)
    if response.status_code not in (200, 201):
        raise SupabaseAuthError(
            f"Authentication service returned an unexpected status: {response.status_code}",
            status_code=503,
        )

    return response.json()


def refresh_access_token(refresh_token: str, settings) -> dict:
    """Exchanges a refresh token for a new access token, via Supabase's own
    refresh grant — the WCAG 2.2.1 "extend before expiry" flow's only
    server-side piece. Returns the same shape `sign_in_with_password` does
    ({access_token, expires_at, refresh_token, user: {...}}); raises
    SupabaseAuthError (401) if the refresh token is expired/invalid/already
    rotated, or (503) if the auth service itself could not be reached."""
    url = f"{settings.resolved_supabase_url}/auth/v1/token"
    headers = {
        "apikey": settings.supabase_anon_key,
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(
            url,
            params={"grant_type": "refresh_token"},
            headers=headers,
            json={"refresh_token": refresh_token},
            timeout=8.0,
        )
    except httpx.HTTPError as exc:
        raise SupabaseAuthError(
            "Could not reach the authentication service", status_code=503
        ) from exc

    if response.status_code in (400, 401):
        raise SupabaseAuthError("Session could not be refreshed", status_code=401)
    if response.status_code != 200:
        raise SupabaseAuthError(
            f"Authentication service returned an unexpected status: {response.status_code}",
            status_code=503,
        )

    return response.json()
