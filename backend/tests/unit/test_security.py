"""
Unit tests for app.core.security.verify_supabase_jwt — entirely self-
contained: mints its own HS256 tokens with a known test secret rather than
needing a live Supabase project, so these run in the default `pytest`
suite. The live-signing-key path (real Supabase project, possibly
asymmetric JWKS) is exercised for real by tests/integration/test_auth_live.py.
"""

from __future__ import annotations

import base64
import json
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
    iat_offset: int = 0,
) -> str:
    now = int(time.time()) + iat_offset
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


def test_token_issued_slightly_in_the_future_tolerated() -> None:
    """A few seconds of `iat`-in-the-future clock drift between this server
    and Supabase's must not fail verification — found as a real, flaky
    failure on a refresh-then-verify round trip against the live project,
    where the freshly-minted token's `iat` could be a fraction of a second
    ahead of local time."""
    token = _make_token(iat_offset=5)
    claims = verify_supabase_jwt(token, _settings())
    assert claims["sub"]


def test_token_issued_far_in_the_future_still_rejected() -> None:
    # The leeway is generous enough for real clock drift, not so generous
    # that a token minted an hour from now silently passes.
    token = _make_token(iat_offset=3600)
    with pytest.raises(AuthError, match="not yet valid"):
        verify_supabase_jwt(token, _settings())


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _forge_token_with_algorithm(algorithm: str) -> str:
    """Builds a syntactically valid 3-segment JWT string carrying an
    arbitrary, attacker-chosen `alg` header value — bypasses `jwt.encode`'s
    own algorithm handling entirely (pyjwt refuses to sign with "none" or
    garbage algorithms), which is exactly what's needed to prove the
    allowlist check runs before any signature verification is attempted."""
    header = _b64url(json.dumps({"alg": algorithm, "typ": "JWT"}).encode())
    now = int(time.time())
    payload = _b64url(
        json.dumps(
            {"sub": "11111111-1111-1111-1111-111111111111", "aud": "authenticated", "iat": now, "exp": now + 3600}
        ).encode()
    )
    return f"{header}.{payload}.forged-signature"


@pytest.mark.parametrize("algorithm", ["none", "HS512", "garbage", ""])
def test_disallowed_algorithm_rejected_before_any_decode_attempt(algorithm: str) -> None:
    token = _forge_token_with_algorithm(algorithm)
    with pytest.raises(AuthError, match="[Aa]lgorithm"):
        verify_supabase_jwt(token, _settings())


def test_substring_issuer_bypass_rejected() -> None:
    """P2 fix: the old `resolved_supabase_url not in issuer` check was a
    substring test, not anchored — an issuer that merely CONTAINS the real
    project's URL somewhere inside it used to pass. The exact-match fix
    must reject this."""
    token = _make_token(issuer=f"https://evil.example/?x={TEST_SUPABASE_URL}/auth/v1")
    with pytest.raises(AuthError, match="not issued by this project"):
        verify_supabase_jwt(token, _settings())


def test_issuer_with_trailing_slash_still_accepted() -> None:
    token = _make_token(issuer=f"{TEST_SUPABASE_URL}/auth/v1/")
    claims = verify_supabase_jwt(token, _settings())
    assert claims["sub"]
