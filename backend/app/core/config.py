"""
config.py — environment/configuration model.

A missing required variable must fail fast at startup, never fall back to a
guessed value. `Settings()` reads from the process environment and from a
`.env` file in `backend/` (never the frontend's root `.env.example`/
`.env.local` — two separate concerns, two separate files).
"""

import re
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Matches the project ref out of a Supabase pooler/direct connection string,
# e.g. postgresql+psycopg://postgres.<ref>:pw@aws-0-...pooler.supabase.com:6543/postgres
_SUPABASE_PROJECT_REF_RE = re.compile(r"postgres\.([a-z0-9]+):")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "INFO"

    # Required — no default. A missing value raises a pydantic ValidationError
    # at Settings() construction time rather than silently using a guess.
    # database_url points at Supabase Postgres; s3_* points at Backblaze B2's
    # S3-compatible endpoint. Neither name is provider-specific, so no other
    # code changes when the value on the other end does.
    database_url: str = Field(...)
    s3_endpoint_url: str = Field(...)
    s3_access_key: str = Field(...)
    s3_secret_key: str = Field(...)
    s3_bucket: str = Field(...)

    # Optional, with a sensible local default.
    test_database_url: str | None = None
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False
    cors_origins: str = "http://localhost:3000"
    # Backblaze B2 application keys are commonly scoped to a single existing
    # bucket only, with no "create bucket" permission at all — attempting
    # create_bucket in that case is a hard failure, not a fallback. Local/dev
    # (MinIO, a permissive key) can leave this on; hosted MVP deployment sets
    # it to false and creates the bucket once, out of band, in the B2 console.
    s3_auto_create_bucket: bool = True

    # --- Supabase Auth (Phase 1) ---
    #
    # supabase_url is optional to SET explicitly, but required to RESOLVE —
    # if not given, it's derived from database_url's pooler project ref
    # (postgres.<ref>@...pooler.supabase.com) so the same project ref isn't
    # duplicated across two env vars that could drift apart. Override
    # SUPABASE_URL explicitly if the project ever moves off the pooler
    # naming scheme this regex assumes.
    supabase_url: str | None = None
    # The anon/public key — safe to hand to a browser by Supabase's own
    # design, and what a password-grant login call authenticates the
    # *calling application* with (not the end user). Never the service-role
    # key: that key bypasses Row Level Security entirely and must never be
    # reachable from anything the frontend can trigger a leak of.
    supabase_anon_key: str = Field(...)
    # Only used for the fast, local, no-network-round-trip HS256 verification
    # path — see app/core/security.py for why this project also supports
    # the newer asymmetric (RS256/ES256) signing path via JWKS, which does
    # not use this value at all.
    supabase_jwt_secret: str = Field(...)

    # Optional — only for tests/integration/test_auth_live.py's real login
    # round trip. Never committed: lives only in the gitignored .env. That
    # test skips cleanly when these are unset rather than failing, since
    # this is a specific optional fixture credential, not general
    # infrastructure reachability (contrast with the Postgres/B2 integration
    # tests, which must fail — not skip — when infra is expected but absent).
    integration_test_email: str | None = None
    integration_test_password: str | None = None

    # --- Gemini (Phase 2) ---
    # Optional, not required at startup — PaddleOCR is the primary OCR
    # provider (confirmed GO); Gemini's job is the structuring stage (always)
    # and OCR fallback (only if Paddle's output looks insufficient). If this
    # is unset, the structuring stage fails cleanly and is retryable once a
    # key is added — the same graceful-degradation discipline as every other
    # external dependency in this codebase, not a startup-time hard failure.
    gemini_api_key: str | None = None
    # gemini-2.5-flash 404'd as deprecated during real Phase 2 testing
    # (2026-09-10) — the live API's own error named gemini-3.6-flash as its
    # replacement, confirmed against the real API, not guessed. Model names
    # drift; if this 404s again, check
    # https://ai.google.dev/gemini-api/docs/models for the current name.
    gemini_model: str = "gemini-3.6-flash"

    # --- E-commerce Listing Scanner (Phase 9) ---
    # Guardrails for fetching a user-submitted URL server-side — see
    # services/ecommerce/ssrf_guard.py and fetcher.py. Conservative
    # defaults; not exposed in the frontend, only tunable via env for an
    # operator who needs to relax/tighten them for a specific deployment.
    ecommerce_fetch_timeout_seconds: float = 8.0
    ecommerce_max_html_bytes: int = 2_000_000
    ecommerce_max_image_bytes: int = 8_000_000
    ecommerce_max_redirects: int = 3
    ecommerce_max_category_listings: int = 20

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_supabase_url(self) -> str:
        if self.supabase_url:
            return self.supabase_url.rstrip("/")
        match = _SUPABASE_PROJECT_REF_RE.search(self.database_url)
        if not match:
            raise ValueError(
                "SUPABASE_URL is not set and could not be derived from DATABASE_URL "
                "(expected a Supabase pooler connection string of the form "
                "postgres.<project-ref>@...pooler.supabase.com). Set SUPABASE_URL explicitly."
            )
        return f"https://{match.group(1)}.supabase.co"


@lru_cache
def get_settings() -> Settings:
    """Cached so every request reuses one Settings instance rather than
    re-reading and re-validating the environment on every call."""
    return Settings()  # type: ignore[call-arg]
