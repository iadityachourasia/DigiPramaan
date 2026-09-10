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
