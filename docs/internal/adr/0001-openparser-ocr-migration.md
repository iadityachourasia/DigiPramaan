# ADR 0001: OpenParser OCR Migration — Architecture and Open Questions

**Status:** Implementation complete; acceptance pending human architecture review. Not yet Accepted — see the Correction Log at the end of this document.

**Date:** 2026-09-18

**Scope:** This is OP-Phase 0 of a 10-phase migration (`docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md`, §18) replacing the production CPU-bound local PaddleOCR execution path with OpenParser-hosted PaddleOCR-VL 1.6, while keeping Gemini as the structuring stage and the deterministic Digi-Pramaan rule engine as the sole legal-decision stage. This document records the decisions Phase 0 is allowed to make (design and tooling choices, not runtime code) and the questions it explicitly cannot answer.

This is a separate, paused track from the repository's main security-first roadmap (plan file §T/§U) — see that file's own §U section for how the two relate.

---

## 1. Status / Context

- Source spec: `docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md` (the full implementation brief this ADR is derived from — read it for anything not decided here).
- Contract: `OCR_API_OPENAPI.yaml` (repo root), OpenAPI 3.1.0.
- **Verified 2026-09-18:** `sha256sum OCR_API_OPENAPI.yaml` = `750d37b8455d6e8349400ef370a0d3f0f518751f95f7a0ebbc6284f9f19f98d7`, which exactly matches the checksum recorded in the spec doc. No contract drift — the spec's own line references and schema analysis remain trustworthy. This is re-verified automatically by `backend/tests/contract/test_openparser_contract.py::test_openapi_file_matches_recorded_checksum` on every test run.
- Branch: `p0-migration-baseline`. Current Alembic head: `0008_record_workflow`.
- Related: `docs/internal/BACKEND_PRODUCTION_AUDIT_AND_REMEDIATION.md` (see §15 cross-reference below).

## 2. Provider boundary decision

**Corrected 2026-09-18** — see Correction Log. The original version of this section claimed the existing synchronous `OcrProvider` Protocol could simply gain a second implementation. That is only partially true and the earlier wording overstated it.

**Decision (revised):**

- `backend/app/services/ocr/provider.py`'s `OcrProvider` Protocol (`extract(image_bytes, image_id) -> OcrResult`, synchronous, returns immediately) **may remain the compatibility boundary for the two LOCAL providers only** — `PaddleOcrProvider` and `GeminiOcrProvider`. Both genuinely complete inline within a single call today; the Protocol's synchronous shape is an honest description of how they work, not a simplification imposed on them.
- **This Protocol cannot be the complete boundary for OpenParser.** OpenParser is an asynchronous, durable, remote job system: admission returns a `202` and a job id, not a result; the caller must reconcile job state over time (poll `GET /jobs/{id}`, handle `queued`/`running`/`succeeded`/`failed`/`indeterminate`), fetch immutable canonical/raw artifacts once terminal, and normalize them into the internal element shape. None of that lifecycle fits inside a single synchronous `extract(bytes, image_id) -> OcrResult` call without either (a) blocking the caller for however long the job takes — reintroducing the exact CPU/latency problem this migration exists to remove — or (b) silently faking synchronicity by polling inside `extract()`, which would hide job state, retries, and failure handling from every caller and make the durable-job design (OP-Phase 3) pointless.
- **Decision for later phases (not implemented in Phase 0):** OpenParser needs its own, separate, job-oriented interface — provisionally an `OpenParserJobService` or equivalent — exposing at minimum: `submit(...)` (admit a job, return a local job handle, never blocking on provider completion), `reconcile(...)`/`poll(...)` (advance a job's local state from the provider's current state, idempotent, safe to call redundantly), `retrieve_artifacts(...)` (fetch and immutably store canonical + raw results once terminal), and `normalize(...)` (adapt stored artifacts into the internal element representation, versioned per OP-Phase 4). `pipeline.py`'s eventual OpenParser-aware stage (OP-Phase 5) depends on this job-oriented interface, not on `OcrProvider.extract()`.
- Whether `OpenParserJobService` sits alongside `OcrProvider` as a parallel abstraction, or `OcrProvider` is retired in favor of a single job-oriented interface used by all three providers (with local providers modeled as instantly-terminal jobs), is **not decided by this ADR** — it is an OP-Phase 2/3 design decision, to be made when the actual HTTP client and persistence model are built, with real code to evaluate against rather than a hypothetical.

**Why the correction matters:** the original wording ("OpenParser becomes a second implementation alongside `PaddleOcrProvider` and `GeminiOcrProvider`") would have quietly pre-committed a later phase to squeezing a fundamentally asynchronous, durable, multi-step remote workflow into an interface shaped for a synchronous local call — exactly the kind of design debt an ADR is supposed to prevent, not launder. No runtime code changes as a result of this correction; `provider.py` is unmodified in Phase 0.

## 3. Nullable/scoped confidence decision

**Decision:** adopt the spec's `OcrConfidence` model as the eventual internal representation:

```python
class OcrConfidence(BaseModel):
    score: float
    scope: Literal["detection", "recognition", "classification", "geometry", "answer", "quality"]
    calibrated: bool = False
    source_value: float | None = None
    source_scale: Literal["zero_to_one", "zero_to_hundred", "log_probability", "unknown"] | None = None
```

This is a strict superset of today's `OcrBlock.confidence: float` (paddle.py, 0–100 scale) and `EvidenceRef.ocr_confidence: float | None` (extraction/schema.py — already nullable, a useful existing precedent).

**Open design question flagged, not resolved here:** `extraction/adapter.py::_representative_confidence()` currently falls back to a placeholder `75.0` for Gemini-only evidence (no real per-block score). Once real scoped confidence exists, this placeholder needs revisiting — a later phase's decision, not Phase 0's.

**Contract facts locked in by `test_openparser_contract.py`:** `Confidence.required == {score, scope, calibrated}`; `additionalProperties: false`; confidence is never listed in `required[]` on any of the 5+ schemas that carry it (proven, not just inspected).

## 4. Upload-once intake decision (design only)

**Decision:** target design is scan draft → one image upload → server evidence-image ID → idempotent finalize, replacing the desktop "double upload" (blob-URL re-fetch-and-reupload) confirmed in the capture inventory (ADR 0001 appendix). Mobile's existing single-upload path (`MobileCaptureView.tsx`) is the precedent to generalize, not reinvent.

**Phase 0 does not implement this** — no frontend file changes, no new backend intake endpoints. This is OP-Phase 1's scope.

## 5. Four-state quality-decision model

**Decision:** adopt `PASS / PASS_WITH_WARNINGS / RECAPTURE_REQUIRED / OVERRIDDEN` as the target quality-verdict model.

**Current-state fact:** neither side of the codebase has this today. Backend `QualityVerdict` (`image_quality.py:46-49`) is 3-state (`PASS|RECAPTURE_REQUIRED|REVIEW`); frontend `QualityCheckResult` (`scan.ts:81-85`) is a plain boolean, and the backend silently collapses `REVIEW` into `passed:true` before the frontend ever sees it (`scans.py:225-255`). **There is no `OVERRIDDEN` state or override UI/API anywhere today.** This is genuinely new work for OP-Phase 1, not a refinement of an existing mechanism.

## 6. Database model proposal outline (no migration in Phase 0)

A future migration (OP-Phase 3) will add an `ocr_provider_jobs` table per the spec's §8 field list (local UUID PK, scan/image FKs, provider/tenant/key aliases, provider batch/child job IDs, idempotency key + canonical request digest, model/profile/option-snapshot, input/derivative artifact hashes, attempt number, submission/reconciliation leases, provider timestamps, poll state, canonical/raw/normalized artifact keys, provider page count/cost).

**Constraint for that future migration:** `down_revision` must be `"0008_record_workflow"` — the confirmed current Alembic head as of this ADR's date. Re-verify this is still current when OP-Phase 3 actually begins; do not assume it.

No model class, no migration file, no schema change is added in Phase 0.

## 7. Idempotency canonicalization design

**Decision:** derive `Idempotency-Key` deterministically from immutable inputs (scan id, image id, input SHA-256, model, profile version, canonical-request digest, attempt number) via HMAC over a fixed template — never a random UUID. A network-ambiguous retry replays the identical key; a materially different variant (different options, different input) gets a new attempt and a new key, linked to the prior one.

Contract facts locked in: `Idempotency-Key` is `required: true`, header, 1–256 chars (verified against `POST /parse/async` and `POST /parse/batch` directly, both reference `#/components/parameters/IdempotencyKey`). Same tenant+operation+key+body replays the same job; different body with the same key returns `409 idempotency_conflict`.

No key-generation code exists yet — this is a design record only, per spec §17.1's "idempotency determinism (as a design property, not yet implemented code)."

## 8. Key/tenant policy

**Decision:** one explicitly approved primary account/key per tenant; failover stays account-aware (never round-robins across tenants, since admission limits are tenant-scoped per the contract's own `info.description`, not key-scoped). This directly contradicts a superficially similar existing pattern (`gemini_client.py`'s comma-separated multi-key fallback) — that pattern must NOT be copied here.

**Blocked on vendor answer** — see §14, Q1.

## 9. Artifact policy

**Decision:** canonical `openparser@1` and raw provider output are retained as separate, immutable, hash-linked artifacts (never overwritten; a new adapter version produces a new normalized artifact, not a rewrite). This matches the confirmed existing invariant that evidence bytes are already stored byte-for-byte with no recompression (`object_storage.py`, `scans.py:145-152`) — the artifact-immutability principle already holds for the source image; this decision extends the same principle to OCR outputs.

**Blocked on vendor answer** — retrieval window for canonical/raw artifacts, see §14, Q3/Q10.

## 10. Coordinate policy

**Decision (baseline, confirmed):** the current invariant — `OcrBlock.bbox` is always original-image pixel space, rescaled back by `paddle.py` after its internal 1600px-max downscale — is what Rule 7 font measurement, evidence crops, and report rendering all depend on today. Any OpenParser-sourced geometry must be provably transformed into that same space before being trusted by that code; if the transform cannot be proven, the pixel bbox must be `None` rather than silently wrong (per spec §12.3).

**Blocked on vendor answer** — coordinate units actually returned for PNG/JPEG inputs and EXIF/page-dimension representation, see §14, Q9. Contract fact: `CoordinateUnit` enum is `pixel|point|inch|normalized` — the contract itself does not guarantee `pixel`.

## 11. Job state machine

**Decision:** adopt the contract's own `JobStatus` enum (`queued|running|succeeded|failed|indeterminate`) and its documented batch-parent derivation rule as authoritative — locked in and tested: a batch parent with any failed child and at least one succeeded child closes as parent `succeeded` (not `failed`), with failed children retained in `summary`/`children`, never dropped. Proven end-to-end by `test_batch_mixed_success_fixture_matches_documented_derivation_rule`.

**Explicit note:** this is a *different, orthogonal* state machine from `pipeline.py`'s existing `scan_sessions.stages` JSONB stage list. OP-Phase 3+ must reconcile the two, not conflate them — a provider job's `succeeded` does not mean the Digi-Pramaan pipeline stage is `completed`; it means the provider work is done and ready to normalize.

## 12. Feature modes

**Decision:** Phase 0 introduces zero feature flags. The eventual modes (`local_paddle`, `openparser_shadow`, `openparser`, optionally `disabled`) are an OP-Phase 2+ decision — recorded here only so future phases don't reinvent the naming.

## 13. Rollback

Phase 0's rollback is "revert doc/test files" — no data, no runtime behavior, no schema is touched. This is the lowest-risk phase in the entire migration by construction.

## 14. Unresolved vendor/compliance questions (verbatim from spec §22)

None of these are answered by this ADR — they require direct vendor contact and are explicitly out of scope for Phase 0. **No production evidence may be sent to OpenParser until these are answered and the spec's §15 security/privacy/procurement gate is signed off.** This blocks OP-Phase 7 (shadow evaluation) and OP-Phase 8 (cutover) — not OP-Phase 0.

> **Overridden 2026-09-19 — see §17.** The project owner explicitly accepted this as a known,
> documented risk rather than resolving it, and `OCR_PROVIDER` now defaults to `openparser` in
> real deployments. The statement above remains the correct STANDING POLICY this ADR recommends;
> §17 records that it was knowingly not followed, by explicit decision, not by oversight.

**Corrected 2026-09-18** — see Correction Log. The table below reproduces all 12 questions from migration-spec §22 exactly (verbatim wording), each now with four separate blank columns (Answer / Answered by / Date / Evidence) rather than one combined "Answered by / date" column — so a partial answer (e.g. an answer with no evidence document yet, or an evidence link pending a named contact) has somewhere to go without overloading one cell. No question below is marked answered.

| # | Question | Answer | Answered by | Date | Evidence |
|---|---|---|---|---|---|
| 1 | Are the 10+ keys in one tenant or distinct tenants, and what are exact rate/concurrency limits? | | | | |
| 2 | Which region processes and stores source and result data? Can India-only processing be guaranteed? | | | | |
| 3 | What are input/result/log/backup retention and deletion mechanisms/SLA? | | | | |
| 4 | Are customer documents or outputs ever used for training or human review? | | | | |
| 5 | Can the account enforce spend/page/concurrency caps? | | | | |
| 6 | What is the durable job retention window and maximum queue age? | | | | |
| 7 | How are API/model/schema changes versioned and announced? | | | | |
| 8 | Which `paddleocr-vl-1.6` options are currently canonical and supported? | | | | |
| 9 | What coordinate units are returned for PNG/JPEG and how are EXIF orientation and page dimensions represented? | | | | |
| 10 | Is raw output guaranteed for this model, and for how long can canonical/raw artifacts be retrieved? | | | | |
| 11 | How are indeterminate admission/billing disputes resolved? | | | | |
| 12 | What support/SLA/security/DPA/subprocessor terms apply to government evidence? | | | | |

## 15. Related findings cross-reference

- **F-007** (`BACKEND_PRODUCTION_AUDIT_AND_REMEDIATION.md` — `BackgroundTasks` is non-durable, general finding): OP-Phase 3's outbox/worker design closes this for the OCR slice specifically. If the repository's own security roadmap (plan file §T, its future durable-processing phase) lands its general fix first, OP-Phase 3 should reuse that infrastructure rather than duplicate it.
- **F-004** (fresh-Alembic-upgrade baseline is structurally broken, pre-existing and independent of this migration): any OP-Phase-3 migration inherits whatever state that baseline is in when OP-Phase 3 actually starts. As of this ADR's date the repository's own `git status` shows the branch already has unrelated modified files from in-progress §T work — this is pre-existing state, not something Phase 0 touched, and must be re-checked (not assumed fixed) when OP-Phase 3 begins.
- **F-012** (data residency/retention/deletion controls unresolved) and this ADR's §14 Q2/Q3 are the same open compliance gate stated in two documents — closing one closes the other.
- **F-015** (OCR/Gemini output lacks sufficient provenance and trust controls — untrusted content embedded in prompts, no citation verification beyond a bounds-check) is effectively a precursor of OP-Phase 6's citation-validation work (spec §13). OP-Phase 6 closes both this ADR's grounding decision and F-015 together.

## 16. Decisions made now vs. still open — summary

**Made now (low-risk, reversible, test-covered):**
- `jsonschema>=4.18` added as a dev-only test dependency (`backend/pyproject.toml`) — the reference draft-2020-12 implementation, pure Python, zero native deps, never imported by `app/`. Chosen over hand-rolling a validator (would mean reimplementing `oneOf`/`enum`/`pattern`/`$ref` resolution for 117 real schemas) and over `openapi-spec-validator`/`prance` (this contract has only local refs; their external-ref machinery is unused weight).
- `PyYAML>=6.0` added explicitly alongside it (`backend/pyproject.toml`) — previously only a transitive dependency; this test suite now depends on it directly to parse `OCR_API_OPENAPI.yaml`, and a transitive dependency can silently disappear on an unrelated upgrade.
- `docs/internal/adr/` as the new ADR directory convention (none existed before).
- Splitting this ADR from the capture-inventory appendix into two files — a decision record (read once, approved) versus a citation-dense reference (re-read repeatedly during implementation) are different reading modes.

**Explicitly not decided — deferred to §14 above, and to the phases where they become load-bearing:** everything about OpenParser's own tenant/legal/retention/coordinate/training-use posture.

## 17. Risk acceptance override (2026-09-19)

Per `docs/internal/PRODUCTION_READINESS_STATUS_AND_ROADMAP.md` §4 Phase R1, the project owner was
asked directly whether to (a) accept §14's unresolved questions as a known risk and keep
`OCR_PROVIDER=openparser` live, (b) pause by reverting the default to `local_paddle` until
resolved, or (c) handle it separately outside this session. **The answer was (a): accept as a
known, documented risk for now.**

This is a business/legal decision, not an engineering one — nothing in the codebase changed as a
result of this entry; it exists purely so a later reader of this ADR (or of §14's still-blank
answer table) understands that real evidence is flowing to OpenParser *despite* those questions
being open, by informed choice, and knows where to find the roadmap document that should be
revisited before any larger-scale citizen-facing rollout. §14's table itself is untouched — still
zero questions answered — this section does not change that; it only records that the project
proceeded without waiting for them to be.

## Correction Log

**2026-09-18 — correction pass, applied before any human review of the original draft:**

1. §2 (Provider boundary decision) rewritten — the original version understated the gap between `OcrProvider`'s synchronous interface and OpenParser's asynchronous/durable job lifecycle. Corrected to state the Protocol may remain the boundary for local providers only, and to require a separate job-oriented interface (submit/reconcile/retrieve-artifacts/normalize) for OpenParser in a later phase. No runtime code added.
2. §14 (unresolved vendor questions) table rebuilt with four separate blank columns (Answer / Answered by / Date / Evidence) instead of one combined column, all 12 questions reproduced verbatim from spec §22, none marked answered.
3. Status line corrected to "Implementation complete; acceptance pending human architecture review." — not marked Accepted.
4. The companion contract test suite (`backend/tests/contract/test_openparser_contract.py`) was corrected in the same pass: the local-`$ref` integrity walker now performs real RFC 6901 JSON Pointer decoding (`~1`→`/`, then `~0`→`~`, malformed escapes rejected) instead of a bare `"/".split()`, which could not have correctly resolved a pointer segment containing an escaped `/` or `~`; added explicit operation → response-component → body-schema mapping tests for the operations this migration will actually call, resolving every `$ref` hop rather than assuming a body shape; added negative validator canary tests proving the schema validator genuinely rejects invalid data (score > 1, invalid enum value, unknown additional property, missing required field), not only that it accepts valid fixtures; added a standalone `JobAccepted`-schema fixture for the literal `POST /parse/async` response body (previously only exercised via the broader `Job` schema, which is a different, wider shape) and an `ErrorResponse` fixture. Fixture count: 20 → 22. Test count: 44 → 95.
5. `backend/pyproject.toml` gained an explicit `PyYAML>=6.0` pin alongside `jsonschema>=4.18`.
6. `docs/internal/OPENPARSER_QUALITY_CORPUS_SPEC.md` expanded with embossed packaging, missing-confidence frequency, licensing/source-authorization policy, retention/deletion policy, complete line/block transcription ground truth, and reviewer-disagreement/versioning rules.

**2026-09-18 — second correction pass, following a further acceptance review of the first correction pass:**

7. §14's questions 1 and 9 were not actually byte-for-byte identical to spec §22 (Q1 had gained "existing" and an extra "the"; Q9 had gained a comma) despite the table's own claim of "verbatim" — both corrected to match §22 exactly, and a new deterministic test (`backend/tests/contract/test_adr_matches_spec_questions.py`) now parses both documents and asserts all 12 questions match byte-for-byte on every test run, so this specific drift cannot recur silently.
8. `backend/tests/contract/openparser_schema.py`'s validator now enforces the JSON Schema `format` keyword (`uri`, `date-time`) via an explicit `FormatChecker`, previously present in the schema text but silently unenforced (jsonschema does not check format content without one). Two new MIT-licensed dev dependencies (`rfc3339-validator`, `rfc3986-validator` — the smallest packages that back exactly these two formats, chosen over jsonschema's GPL-licensed default `uri` backend `rfc3987`) were added; a negative canary now proves an invalid `OcrModelCatalogEntry.benchmark.source_url` is rejected, and a positive canary proves a well-formed one is accepted.
9. The local-`$ref` integrity test now recursively walks the ENTIRE loaded OpenAPI document (previously scoped to `components`/`paths` only, which would have silently missed a `$ref` placed anywhere else the spec permits one); a companion test guards against the walk's scope being silently narrowed again. External-reference rejection and RFC 6901 decoding are unchanged (still enforced).
10. This ADR's §2 (Provider boundary decision) is unaffected by this pass — reviewed and confirmed still correct.
11. `docs/internal/OPENPARSER_QUALITY_CORPUS_SPEC.md`'s per-item example was rewritten so every field its own prose calls mandatory (`source_authorization`, `provenance`, `reviewer_history`, `disagreement_records`, `adjudication_outcome`, `lifecycle`) actually appears in the worked JSON example, not just in surrounding text. Its retention section no longer implies a specific duration — `lifecycle.retention_duration` is explicit placeholder text pending product/legal/data-owner approval — while deletion owner, deletion trigger, and a deletion-verification record are defined as engineering-process facts. Its character-accuracy definition (new §5a) is now bounded `[0,1]` by explicit clamping, defines a deterministic greedy IoU-based line-alignment algorithm, an empty-ground-truth/empty-prediction table, separate micro-/macro-aggregation, and keeps CER as a distinct, explicitly-unbounded metric.
12. Test-count reporting corrected: prior reports called the pre-existing 363 unit+contract tests "unit tests" as a block; corrected to 361 genuine unit tests + 2 pre-existing contract tests (`test_records_contract.py`) = 363 pre-existing subtotal. See the OP-Phase 0 final acceptance report for the exact post-this-pass counts.

**2026-09-18 — third correction pass, documentation-only (no code/fixture/contract/dependency changes — `docs/internal/OPENPARSER_QUALITY_CORPUS_SPEC.md` only):**

13. §5a's micro-average formula was corrected to the same `max(0.0, ...)` clamp already applied to the per-line formula in the second pass — the aggregate had been left unbounded below zero. A zero-scorable-ground-truth-lines case (every line `legible: false`, or no lines at all) now explicitly reports "N/A / not applicable," never an artificial `1.0` from the denominator's own `max(sum(len), 1)` floor.
14. Hallucinated (unmatched predicted) text was previously excluded from every accuracy computation entirely — an OCR system could emit unlimited invented text alongside perfect performance on real lines and still report 100% accuracy. §5a now defines two distinct, clearly-named metrics: **matched-line recognition accuracy** (recognition quality on lines the model actually attempted, silent on hallucination) and **end-to-end OCR text accuracy** (adds an edit-distance insertion-cost penalty, `len(predicted_text)` per hallucinated element, to the same numerator — always ≤ matched-line accuracy). The hallucinated-element count/rate diagnostic is retained, reported alongside, never in place of, the insertion penalty.
15. §2's `full_transcription.lines[]` entries gained five geometry-implementability fields (`page_number`, `bbox_unit`, `coordinate_origin`, `source_image_width`/`height`, `exif_orientation_normalized`) — alignment against provider geometry was previously unimplementable from a bare, unit-less `bbox`. New prose requires provider geometry to be proven-transformed into this same pixel/top-left/EXIF-normalized coordinate system (cross-referencing this ADR's own §10) before alignment; an unprovable transform is marked `unscorable_geometry` and excluded, never guessed.
16. §5a's alignment algorithm now states an explicit block-vs-line policy: a provider `TextElement` with multiple `locations[]` entries is split into one predicted line unit per location when its `text` cleanly splits into a matching number of newline-delimited segments, and otherwise kept as one union-bbox block unit explicitly tagged `alignment_granularity: "block"` — never silently treated as exactly one ground-truth line regardless of its actual shape.
