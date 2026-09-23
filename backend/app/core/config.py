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
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
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
    #
    # May hold multiple comma-separated keys (same convention as
    # cors_origins/cors_origin_list below) — Gemini's free-tier quota is
    # enforced per Google Cloud project, so a demo-day backup against
    # quota exhaustion is simply more keys from separate projects, tried
    # in order by gemini_client.call_with_key_fallback().
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

    # --- Mobile QR Handoff (Phase 10) ---
    # `frontend_base_url` is where the QR's mobileUrl points
    # (`{frontend_base_url}/mobile-capture/{token}`) — separate from
    # `cors_origins` (which can list several) since this is specifically
    # "the one origin a QR code should send a phone to."
    frontend_base_url: str = "http://localhost:3000"
    mobile_handoff_expiry_minutes: int = 15
    mobile_upload_max_mb: int = 10

    # --- Internal report-render bridge (F-003 fix) ---
    # Service-to-service auth for POST {frontend_base_url}/api/internal/
    # render-report — the Next.js route that actually renders the PDF/DOCX
    # (report-render-v2 lives in that repo, with a working Node runtime
    # already deployed; the backend's own container never has one). This
    # secret is the ONLY thing standing between that route and the public
    # internet, since /api/internal/* is deliberately excluded from the
    # ENABLE_MOCK_API lockdown (src/proxy.ts) — it must be set identically
    # on both sides, never logged, never reused for anything else.
    internal_render_secret: SecretStr | None = None

    # --- OpenParser OCR migration ---
    #
    # OP-Phases 2-7 built and live-verified the OpenParser integration
    # (real catalog + parse/poll/result round trip against paddleocr-vl-1.6,
    # 2026-09-19). Per explicit project-owner direction, `openparser` is now
    # the DEFAULT provider — cost is not a constraint (the configured key
    # pool has many separate-tenant keys). `local_paddle` remains fully
    # supported and unchanged for any deployment that explicitly sets
    # OCR_PROVIDER=local_paddle (e.g. a rollback). An environment that
    # already sets OCR_PROVIDER explicitly (this repo's own checked-in
    # backend/.env.example among them) is unaffected by this default either
    # way — only an environment with NO OCR_PROVIDER value at all picks this
    # default up.
    ocr_provider: Literal["local_paddle", "openparser_shadow", "openparser", "disabled"] = (
        "openparser"
    )
    openparser_base_url: str = "https://api.openparser.dev"
    # SecretStr specifically here — the one field spec §14/§7.1 calls
    # "redacted settings" about. str(settings.openparser_api_key) still
    # reveals it on purpose (the client needs the real value to
    # authenticate); what SecretStr buys is that logging, repr(), and
    # model_dump() never do that by accident.
    #
    # May hold ONE key or a COMMA-SEPARATED LIST — same raw-field-plus-
    # parsed-property convention as gemini_api_key/gemini_api_keys below,
    # so `openparser_api_keys` (plural property, further down) is how
    # multi-key code reads it. Multi-key round-robin
    # (OpenParserKeyPool, services/ocr/openparser/pool.py) is a
    # DELIBERATE deviation from the implementation spec's own §7.2
    # guidance ("do not round-robin keys... keys from different tenants
    # fragment idempotency, job visibility, billing, retention, access
    # control, and deletion") — the project owner confirmed the 15+
    # configured keys ARE from separate accounts/tenants, accepting that
    # tradeoff explicitly. The pool's own module docstring documents the
    # mitigation (pinning a job to the same key/tenant for its whole
    # lifecycle) in full. Add more keys later by editing this one env
    # var — no code change needed.
    openparser_api_key: SecretStr | None = None
    openparser_api_key_alias: str | None = None
    openparser_tenant_alias: str | None = None
    # OP-Phase 3 — idempotency key derivation (spec §9) deliberately uses a
    # SEPARATE secret from the provider API key, so a key rotation never
    # changes what a replayed submission's idempotency key resolves to, and
    # so this secret is never sent over the wire to OpenParser at all.
    openparser_idempotency_secret: SecretStr | None = None
    openparser_ocr_model: str = "paddleocr-vl-1.6"
    openparser_quality_profile: str = "openparser-quality-max-v1"
    openparser_connect_timeout_seconds: float = 10.0
    openparser_write_timeout_seconds: float = 120.0
    openparser_read_timeout_seconds: float = 30.0
    openparser_pool_timeout_seconds: float = 10.0
    openparser_max_response_bytes: int = 52_428_800
    openparser_poll_min_seconds: float = 2.0
    openparser_poll_max_seconds: float = 60.0
    openparser_job_max_age_seconds: int = 3600
    openparser_submission_max_attempts: int = 8
    # Gated further at the test-call-site level (spec §17.5: also requires
    # APP_ENV=test, an explicit test tenant/key, a fixture allow-list, and
    # a hard cost cap) — this flag alone never authorizes a live call.
    openparser_live_tests: bool = False

    @model_validator(mode="after")
    def _validate_openparser_in_production(self) -> "Settings":
        """Spec §14's production-validation list. Only enforced in
        `production` — matches this file's own "fail fast at startup"
        philosophy without blocking local/dev/test runs that never touch
        OpenParser (ocr_provider defaults to local_paddle everywhere else)."""
        if self.app_env != "production":
            return self

        parsed = urlsplit(self.openparser_base_url)
        if parsed.scheme != "https" or parsed.username or parsed.query or parsed.fragment:
            raise ValueError(
                "OPENPARSER_BASE_URL must be HTTPS with no userinfo, query, or fragment "
                f"in production (got {self.openparser_base_url!r})"
            )

        if self.ocr_provider != "local_paddle":
            missing = [
                name
                for name, value in (
                    ("OPENPARSER_API_KEY", self.openparser_api_key),
                    ("OPENPARSER_API_KEY_ALIAS", self.openparser_api_key_alias),
                    ("OPENPARSER_TENANT_ALIAS", self.openparser_tenant_alias),
                    ("OPENPARSER_IDEMPOTENCY_SECRET", self.openparser_idempotency_secret),
                )
                if not value
            ]
            if missing:
                raise ValueError(
                    f"ocr_provider={self.ocr_provider!r} requires {', '.join(missing)} "
                    "to be set in production"
                )

        positive_fields = (
            "openparser_connect_timeout_seconds",
            "openparser_write_timeout_seconds",
            "openparser_read_timeout_seconds",
            "openparser_pool_timeout_seconds",
            "openparser_max_response_bytes",
            "openparser_poll_min_seconds",
            "openparser_poll_max_seconds",
            "openparser_job_max_age_seconds",
            "openparser_submission_max_attempts",
        )
        non_positive = [name for name in positive_fields if getattr(self, name) <= 0]
        if non_positive:
            raise ValueError(
                f"OpenParser timeout/budget/poll fields must be positive: {', '.join(non_positive)}"
            )
        if self.openparser_poll_min_seconds > self.openparser_poll_max_seconds:
            raise ValueError(
                "OPENPARSER_POLL_MIN_SECONDS must not exceed OPENPARSER_POLL_MAX_SECONDS"
            )
        return self

    @model_validator(mode="after")
    def _validate_internal_render_secret_in_production(self) -> "Settings":
        """Report generation silently can't reach the renderer without this
        (F-003 fix) — fail fast at startup in production rather than only
        discovering it the first time an officer clicks "Generate Report"."""
        if self.app_env == "production" and not self.internal_render_secret:
            raise ValueError("INTERNAL_RENDER_SECRET must be set in production")
        return self

    # --- P2 hardening (2026-09-19): request-size limits (F-006/N-16) ---
    # `scan_image_max_bytes` covers desktop/device-camera capture, which
    # had no equivalent cap before this phase (only the mobile per-image
    # path had `mobile_upload_max_mb`, checked post-read). Headroom above
    # mobile_upload_max_mb since device capture can produce larger raw
    # files than a phone's own compressed camera output.
    scan_image_max_bytes: int = 15_000_000
    # Generic cap for any bulk list-bound request body, reused across
    # bulk-shaped endpoints rather than one bespoke field per route.
    records_bulk_max_items: int = 500
    # Matches the existing ecommerce_max_category_listings order of
    # magnitude — a batch is officer-selected URLs from that same listing.
    ecommerce_batch_max_urls: int = 20

    # --- P2 hardening (2026-09-19): login/refresh rate limiting (F-010) ---
    auth_login_rate_limit_window_seconds: int = 60
    auth_login_rate_limit_max_attempts: int = 10
    auth_refresh_rate_limit_window_seconds: int = 60
    auth_refresh_rate_limit_max_attempts: int = 20
    # How many hops of X-Forwarded-For to trust as proxy-appended (Azure
    # App Service's own front end typically adds exactly one) before
    # reading the real client IP — see app/core/client_ip.py. 0 means
    # "trust nothing, use the raw socket peer" — always safe, never a
    # fail-open condition, so no production-only validation is needed here.
    trusted_proxy_hop_count: int = 1

    # --- P2 hardening (2026-09-19): short-lived download tickets (F-010) ---
    # Replaces `?access_token=` for report downloads and evidence-image
    # reads. A DEDICATED secret, separate from every other secret in this
    # file (supabase_jwt_secret, internal_render_secret, the OpenParser
    # idempotency secret) — one secret per purpose, so rotating one never
    # invalidates or weakens another.
    download_ticket_secret: SecretStr | None = None
    download_ticket_ttl_seconds: int = 120

    @model_validator(mode="after")
    def _validate_download_ticket_secret_in_production(self) -> "Settings":
        if self.app_env == "production" and not self.download_ticket_secret:
            raise ValueError("DOWNLOAD_TICKET_SECRET must be set in production")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def gemini_api_keys(self) -> list[str]:
        if not self.gemini_api_key:
            return []
        return [key.strip() for key in self.gemini_api_key.split(",") if key.strip()]

    @property
    def openparser_api_keys(self) -> list[str]:
        """`openparser_api_key`'s value split on commas — one key or many.
        See that field's own docstring for why "many" is a deliberate,
        disclosed deviation from the implementation spec for this
        specific project's confirmed-different-tenant key set."""
        if not self.openparser_api_key:
            return []
        raw = self.openparser_api_key.get_secret_value()
        return [key.strip() for key in raw.split(",") if key.strip()]

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
