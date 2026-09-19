"""
services/ocr/openparser/pool.py — OpenParserKeyPool, round-robin admission
across multiple OpenParser API keys FROM DIFFERENT ACCOUNTS/TENANTS.

THIS IS A DELIBERATE, DISCLOSED DEVIATION FROM THE IMPLEMENTATION SPEC
------------------------------------------------------------------------
`docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md` §7.2 is explicit:
"Do not round-robin keys to increase throughput. The contract states
quotas are tenant scoped. Keys from different tenants fragment
idempotency, job visibility, billing, retention, access control, and
deletion. Do not automatically fail over across tenants." The spec's own
model is one active primary key plus a same-tenant standby.

The project owner confirmed (2026-09-18) that the 15+ configured keys ARE
from separate accounts (each a separate signup's $10 trial credit), not
one tenant's key set, and asked for automatic round-robin/fallback across
all of them regardless. This module is how that request is met WITHOUT
silently reproducing the exact failure mode the spec warns about:

- A NEW admission (submit_parse_async/submit_parse_batch) round-robins
  across every key that isn't currently disabled.
- Once a job is admitted, its `job_id` is PINNED to whichever key/tenant
  admitted it — every later call about that job (get_job, get_job_result)
  is routed through that SAME key. Round-robin only ever chooses a key for
  a brand-new admission, never for an in-flight job. This is what stops
  "submitted under key A, polled under key B, tenant-scoped 404" from
  ever happening.
- A key that fails with 401/403 (bad/revoked) or 402 (exhausted credits)
  is marked disabled and skipped for future admissions — but NOT for
  polling/result calls on jobs already pinned to it, since those are free
  reads regardless of remaining credit (billing applies only to a
  successful terminal parse, per the contract's own billing section).

DISCLOSED LIMITATION — NOT FIXED IN THIS PHASE
------------------------------------------------
The job-id -> key-alias pin lives in this instance's own memory only. A
process restart loses it, orphaning any job admitted before the restart
(its poll/result calls would need to try every key to find the one that
admitted it — not implemented here). OP-Phase 3's persistent
`ocr_provider_jobs` table is where `key_alias` becomes a real column and
this limitation goes away; this pool is Phase 2's HTTP-client-layer
concern only, never wired into the pipeline yet.
"""

from __future__ import annotations

from collections.abc import Callable

import httpx

from app.core.config import Settings
from app.services.ocr.openparser.client import OpenParserClient
from app.services.ocr.openparser.errors import (
    OpenParserAuthError,
    OpenParserError,
    OpenParserInsufficientCredits,
)
from app.services.ocr.openparser.schemas import BatchJobAccepted, Job, JobAccepted, ParsedDocument, RawParseResult


class OpenParserAllKeysExhausted(OpenParserError):
    """Every configured key is disabled (auth failure or exhausted
    credits). Distinct from a single key's own error so a caller can tell
    "this one key is having a bad day" apart from "the whole pool is
    dead — someone needs to add a key or top up billing."""


class OpenParserUnknownJob(OpenParserError):
    """`get_job`/`get_job_result` called for a job_id this pool instance
    never admitted (or admitted before a process restart — see module
    docstring's disclosed limitation)."""


class OpenParserKeyPool:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], float] | None = None,
        sleeper: Callable[[float], None] | None = None,
        jitter: Callable[[], float] | None = None,
    ) -> None:
        keys = settings.openparser_api_keys
        if not keys:
            raise ValueError(
                "OpenParserKeyPool requires at least one key in settings.openparser_api_keys "
                "(OPENPARSER_API_KEY, comma-separated for multiple)"
            )

        self._aliases: list[str] = [f"key-{i + 1}" for i in range(len(keys))]
        self._clients: dict[str, OpenParserClient] = {
            alias: OpenParserClient(
                settings,
                transport=transport,
                clock=clock,
                sleeper=sleeper,
                jitter=jitter,
                api_key_override=key,
                tenant_alias_override=alias,
            )
            for alias, key in zip(self._aliases, keys)
        }
        self._next_index = 0
        self._disabled: set[str] = set()
        # In-memory only — see module docstring's disclosed limitation.
        self._job_key_alias: dict[str, str] = {}

    def close(self) -> None:
        for client in self._clients.values():
            client.close()

    def __enter__(self) -> "OpenParserKeyPool":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    @property
    def key_count(self) -> int:
        return len(self._aliases)

    @property
    def disabled_aliases(self) -> frozenset[str]:
        return frozenset(self._disabled)

    def key_alias_for(self, job_id: str) -> str | None:
        """The key alias that admitted `job_id`, or `None` if this pool
        instance never admitted it (e.g. after a restart). OP-Phase 3's
        worker persists this onto the `OcrProviderJob` row so the pin
        survives a restart, closing this pool's own disclosed in-memory-
        only limitation (see module docstring)."""
        return self._job_key_alias.get(job_id)

    def enable(self, alias: str) -> None:
        """Manual recovery — e.g. an operator topped up that account's
        credits, or rotated in a fresh key under the same alias slot."""
        self._disabled.discard(alias)

    # ------------------------------------------------------------------ #
    # Admission — round-robins across every non-disabled key.
    # ------------------------------------------------------------------ #

    def submit_parse_async(self, **kwargs: object) -> JobAccepted:
        alias, result = self._admit(lambda client: client.submit_parse_async(**kwargs))  # type: ignore[arg-type]
        self._job_key_alias[result.id] = alias
        return result

    def submit_parse_batch(self, **kwargs: object) -> BatchJobAccepted:
        alias, result = self._admit(lambda client: client.submit_parse_batch(**kwargs))  # type: ignore[arg-type]
        self._job_key_alias[result.id] = alias
        return result

    def _admit(self, call: Callable[[OpenParserClient], JobAccepted | BatchJobAccepted]):
        attempted: set[str] = set()
        last_error: OpenParserError | None = None
        while len(attempted) < len(self._aliases):
            alias = self._next_available_alias(exclude=attempted)
            if alias is None:
                break
            attempted.add(alias)
            try:
                result = call(self._clients[alias])
            except (OpenParserAuthError, OpenParserInsufficientCredits) as exc:
                self._disabled.add(alias)
                last_error = exc
                continue
            return alias, result

        raise OpenParserAllKeysExhausted(
            "Every configured OpenParser key failed auth/billing; "
            f"{len(self._disabled)}/{len(self._aliases)} disabled"
        ) from last_error

    def _next_available_alias(self, *, exclude: set[str]) -> str | None:
        n = len(self._aliases)
        for offset in range(n):
            idx = (self._next_index + offset) % n
            alias = self._aliases[idx]
            if alias in self._disabled or alias in exclude:
                continue
            self._next_index = (idx + 1) % n
            return alias
        return None

    # ------------------------------------------------------------------ #
    # Reads — ALWAYS pinned to the key that admitted the job.
    # ------------------------------------------------------------------ #

    def get_job(self, job_id: str) -> Job:
        return self._clients[self._pinned_alias(job_id)].get_job(job_id)

    def get_job_result(self, job_id: str, *, format: str | None = None) -> ParsedDocument | RawParseResult:
        return self._clients[self._pinned_alias(job_id)].get_job_result(job_id, format=format)

    def get_job_via_alias(self, alias: str, job_id: str) -> Job:
        """Same as `get_job`, but takes an explicit, already-known alias
        instead of consulting the in-memory pin — for OP-Phase 3's worker,
        which persists `provider_key_alias` on the `OcrProviderJob` row and
        so can route correctly even after this pool instance restarted and
        lost its own in-memory pin for the job."""
        return self._clients[alias].get_job(job_id)

    def get_job_result_via_alias(
        self, alias: str, job_id: str, *, format: str | None = None
    ) -> ParsedDocument | RawParseResult:
        return self._clients[alias].get_job_result(job_id, format=format)

    def _pinned_alias(self, job_id: str) -> str:
        alias = self._job_key_alias.get(job_id)
        if alias is None:
            raise OpenParserUnknownJob(
                f"job_id {job_id!r} was never admitted through this pool instance "
                "(or the process restarted since it was — see pool.py's own "
                "disclosed limitation; Phase 3 persists this mapping)"
            )
        return alias

    def list_ocr_models(self) -> object:
        """Catalog reads are tenant-independent (every account sees the
        same model list) — any non-disabled client works; no pinning
        concept applies here."""
        alias = self._next_available_alias(exclude=set())
        if alias is None:
            raise OpenParserAllKeysExhausted("Every configured OpenParser key is disabled")
        return self._clients[alias].list_ocr_models()
