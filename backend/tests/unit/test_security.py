"""
Unit tests for app.core.security.verify_supabase_jwt — entirely self-
contained: mints its own HS256 tokens with a known test secret rather than
needing a live Supabase project, so these run in the default `pytest`
suite. The live-signing-key path (real Supabase project, possibly
asymmetric JWKS) is exercised for real by tests/integration/test_auth_live.py.
"""

from __future__ import annotations

import time
from types import SimpleNamespace

import jwt
import pytest

from app.core.security import AuthError, verify_supabase_jwt

TEST_SECRET = "unit-test-secret-not-a-real-supabase-jwt-secret"
TEST_SUPABASE_URL = "https://testproject.supabase.co"


def _settings(secret: str = TEST_SECRET, url: str = TEST_SUPABASE_URL):
    return SimpleNamespace(supabase_jwt_secret=secret, resolved_supabase_url=url)


def _make_token(
    *,
    secret: str = TEST_SECRET,
    sub: str | None = "11111111-1111-1111-1111-111111111111",
    audience: str = "authenticated",
    issuer: str | None = None,
    expires_in: int = 3600,
) -> str:
    now = int(time.time())
    claims: dict = {"aud": audience, "iat": now, "exp": now + expires_in}
    if sub is not None:
        claims["sub"] = sub
    if issuer is not None:
        claims["iss"] = issuer
    return jwt.encode(claims, secret, algorithm="HS256")


def test_valid_token_returns_claims() -> None:
    token = _make_token(issuer=f"{TEST_SUPABASE_URL}/auth/v1")
    claims = verify_supabase_jwt(token, _settings())
    assert claims["sub"] == "11111111-1111-1111-1111-111111111111"


def test_valid_token_with_no_issuer_claim_still_passes() -> None:
    # Some Supabase configurations may not always carry `iss` — the check
    # is soft (only rejects a MISMATCHING issuer), never hard-required.
    token = _make_token(issuer=None)
    claims = verify_supabase_jwt(token, _settings())
    assert claims["sub"]


def test_expired_token_rejected() -> None:
    token = _make_token(expires_in=-10)
    with pytest.raises(AuthError, match="expired"):
        verify_supabase_jwt(token, _settings())


def test_wrong_audience_rejected() -> None:
    token = _make_token(audience="some-other-audience")
    with pytest.raises(AuthError):
        verify_supabase_jwt(token, _settings())


def test_wrong_signing_secret_rejected() -> None:
    token = _make_token(secret="a-different-secret-entirely")
    with pytest.raises(AuthError):
        verify_supabase_jwt(token, _settings())


def test_token_from_a_different_project_rejected() -> None:
    token = _make_token(issuer="https://someone-elses-project.supabase.co/auth/v1")
    with pytest.raises(AuthError, match="not issued by this project"):
        verify_supabase_jwt(token, _settings())


def test_missing_subject_claim_rejected() -> None:
    token = _make_token(sub=None)
    with pytest.raises(AuthError, match="subject"):
        verify_supabase_jwt(token, _settings())


def test_malformed_token_rejected() -> None:
    with pytest.raises(AuthError, match="[Mm]alformed"):
        verify_supabase_jwt("not-a-jwt-at-all", _settings())
