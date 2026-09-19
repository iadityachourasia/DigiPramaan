"""
security.py — cryptographic verification of a Supabase-issued access token.

Deliberately NOT a network round-trip per request (no calling Supabase's
`/auth/v1/user` on every protected endpoint) — the token is verified
locally against its own signature, which is faster and is exactly what a
JWT is for.

Supabase projects can sign access tokens one of two ways, and this project
supports both rather than assuming one:

  - Legacy: shared-secret HS256, verified against SUPABASE_JWT_SECRET.
  - Newer projects ("JWT signing keys"): asymmetric ES256/RS256, verified
    against the project's public JWKS at
    `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`.

Which one applies is read from the token's own `alg` header at verify time
— nothing here hardcodes an assumption about which mechanism the connected
project actually uses.
"""

from __future__ import annotations

import jwt
from jwt import PyJWKClient

# One PyJWKClient per resolved Supabase URL, reused across requests — it
# caches the fetched key set internally, so this avoids re-fetching the
# JWKS document on every asymmetric-signed request.
_jwks_clients: dict[str, PyJWKClient] = {}

SUPABASE_AUDIENCE = "authenticated"

# P2 fix (2026-09-19): fixed, not a Settings field — this is an invariant
# of what Supabase can ever emit, not an environment-tunable value. An
# env-configurable allowlist would just let a misconfiguration widen it.
_ALLOWED_ALGORITHMS = frozenset({"HS256", "RS256", "ES256"})


class AuthError(Exception):
    """Raised for any token that fails verification, for any reason —
    callers map this uniformly to 401, never leaking which specific check
    failed to the client."""


def _jwks_client_for(jwks_url: str) -> PyJWKClient:
    client = _jwks_clients.get(jwks_url)
    if client is None:
        client = PyJWKClient(jwks_url)
        _jwks_clients[jwks_url] = client
    return client


def verify_supabase_jwt(token: str, settings) -> dict:
    """Verifies signature, expiry, and audience; soft-checks issuer (see
    below). Returns the decoded claims dict on success, containing at least
    `sub` (the Supabase Auth user id). Raises AuthError on any failure.
    """
    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise AuthError("Malformed token") from exc

    algorithm = header.get("alg", "HS256")
    if algorithm not in _ALLOWED_ALGORITHMS:
        # P2 fix (2026-09-19): the old code let an attacker-controlled
        # header `alg` value (e.g. "none", "HS512", garbage) fall through
        # into the `else` branch below and reach `jwt.decode(algorithms=
        # [algorithm])` unconstrained. Reject before either decode branch
        # runs, so only the three algorithms Supabase can ever actually
        # sign with are ever passed to `jwt.decode`.
        raise AuthError("Unsupported token algorithm")

    # A few seconds of tolerance against `exp`/`iat`/`nbf` for clock drift
    # between this server and Supabase's — with zero leeway, a token
    # verified within roughly a second of being issued (e.g. immediately
    # after POST /auth/refresh) can fail as "not yet valid" purely because
    # the two clocks disagree by a fraction of a second, not because
    # anything is actually wrong with the token. Found via a real, flaky
    # failure on a refresh-then-verify round trip against the live project.
    _CLOCK_SKEW_LEEWAY_SECONDS = 10

    try:
        if algorithm.startswith("HS"):
            claims = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=SUPABASE_AUDIENCE,
                leeway=_CLOCK_SKEW_LEEWAY_SECONDS,
                options={"verify_iss": False},  # soft-checked manually below
            )
        else:
            jwks_url = f"{settings.resolved_supabase_url}/auth/v1/.well-known/jwks.json"
            signing_key = _jwks_client_for(jwks_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=[algorithm],
                audience=SUPABASE_AUDIENCE,
                leeway=_CLOCK_SKEW_LEEWAY_SECONDS,
                options={"verify_iss": False},
            )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Token has expired") from exc
    except jwt.ImmatureSignatureError as exc:
        raise AuthError("Token is not yet valid") from exc
    except jwt.InvalidAudienceError as exc:
        raise AuthError("Token has the wrong audience") from exc
    except jwt.PyJWTError as exc:
        raise AuthError("Token signature is invalid") from exc

    # Exact (trailing-slash-tolerant) issuer check: reject a token from a
    # DIFFERENT Supabase project (e.g. a stray token from a staging/other
    # project reused against this one). P2 fix (2026-09-19): the previous
    # `resolved_supabase_url not in issuer` substring check was not
    # anchored — an issuer like "https://evil.example/?x=<real-project>"
    # would satisfy it. Supabase's own issuer format is always
    # "{SUPABASE_URL}/auth/v1", so compare against that exactly.
    issuer = claims.get("iss")
    expected_issuer = f"{settings.resolved_supabase_url}/auth/v1"
    if issuer and issuer.rstrip("/") != expected_issuer.rstrip("/"):
        raise AuthError("Token was not issued by this project")

    if not claims.get("sub"):
        raise AuthError("Token is missing its subject claim")

    return claims
