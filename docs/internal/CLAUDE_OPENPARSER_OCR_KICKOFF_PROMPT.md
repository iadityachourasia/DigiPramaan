# Copy-ready Claude Code kickoff prompt

Paste the prompt below into Claude Code from the Digi-Pramaan repository root. Attach or keep the checked-in `OCR_API_OPENAPI.yaml` available. This prompt deliberately starts with Phase 0; Claude must not attempt the entire migration in one uncontrolled change set.

---

You are the senior backend engineer responsible for a production-grade OCR provider migration in Digi-Pramaan, a Government of India legal-metrology evidence system.

Read these files completely before making changes:

1. `AGENTS.md`
2. `.claude/CLAUDE.md`
3. `docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md`
4. `OCR_API_OPENAPI.yaml`
5. `docs/internal/BACKEND_PRODUCTION_AUDIT_AND_REMEDIATION.md`
6. The current OCR, pipeline, storage, extraction, models, migrations, routes, and tests referenced by the implementation specification

Recompute the SHA-256 of `OCR_API_OPENAPI.yaml` before using it. The implementation specification records the audited checksum. If it differs, stop and re-audit the changed contract before editing runtime code.

First inspect `git status`. The working tree contains user-owned modified and untracked files. Preserve all of them. Do not reset, checkout, delete, overwrite, mass-format, or “clean up” unrelated work. Reconcile the plan with the current code and current Alembic head before editing.

Goal: professionally replace the production CPU-bound local PaddleOCR execution path with OpenParser-hosted PaddleOCR-VL 1.6 while keeping Gemini as the structuring stage and the deterministic Digi-Pramaan rule engine as the legal-decision stage. The browser/mobile client must continue to talk only to Digi-Pramaan. OpenParser credentials and provider job details must remain server-side.

Non-negotiable invariants:

- Preserve each original evidence file byte-for-byte in private storage with SHA-256. Do not destructively compress or overwrite it.
- For selected files, retain and upload the original `File`; do not reconstruct it from a preview URL. Prefer a full-resolution still photo over a canvas video-frame snapshot. Treat canvas JPEG capture as a tagged compatibility fallback, not as the sensor original.
- Add fast browser quality guidance on a disposable downscaled copy, but keep it non-authoritative. FastAPI independently makes the persisted quality decision before any paid OCR call.
- Replace the current desktop double-upload flow with scan draft -> one image upload -> server evidence-image ID -> idempotent finalize. Align mobile and desktop on the same backend intake/quality service.
- Use `PASS`, `PASS_WITH_WARNINGS`, `RECAPTURE_REQUIRED`, and audited officer `OVERRIDDEN` semantics. Weak distortion/no-text heuristics must warn rather than hard-reject.
- Use the original eligible PNG/JPEG for the first OCR pass, within OpenParser's 50 MiB/file, 100 MP/page, and 100 MiB/batch limits.
- Never expose a bearer key in frontend code, URLs, logs, traces, errors, database rows, or analytics.
- Do not round-robin the user's 10+ keys. The OpenAPI says rate/concurrency limits are tenant scoped. Use one explicitly approved primary account/key and keep failover account-aware.
- Every parse admission uses a deterministic `Idempotency-Key`. Network ambiguity replays the exact request with the same key. A genuinely different variant/retry gets a linked new attempt and key.
- Use asynchronous durable parse jobs, local durable submission/reconciliation, leases, retries, and stale-job recovery. FastAPI `BackgroundTasks` is not a production queue.
- Store canonical `openparser@1`, raw provider result when available, and normalized output as separate immutable hash-linked artifacts.
- Preserve image ID, angle, model, option snapshot, profile version, provider job, input hash, coordinate unit, page dimensions, transforms, and adapter version.
- Do not treat provider coordinates as original-image pixels unless a tested transform proves it. Pixel-dependent legal/font checks must decline to calculate when geometry is unverified.
- Do not invent options from examples. Resolve the selected model and option schema using `GET /models/ocr`; enable the maximum relevant supported quality controls and record the frozen profile.
- PaddleOCR-VL text-recognition confidence is optional and generally unavailable as a reliable probability. OpenParser element confidence is optional, scoped, and may be uncalibrated. Missing remains `None`; never substitute zero/one/100, a layout score, Gemini self-confidence, or an image-quality score.
- Preserve confidence score, scope, calibration flag, source value, and source scale when present. Never relabel detection confidence as recognition confidence or average incompatible scopes.
- Inspect every child of a batch. A succeeded batch parent can contain failed children.
- OpenParser/Gemini output is untrusted. Gemini must cite supplied OCR element IDs; server code validates citations and copies evidence from authoritative elements. Gemini never determines legal compliance.
- No paid live OCR in ordinary tests or CI. Use schema-valid fixtures and mocked HTTP. Live smoke is explicit, synthetic, one-page, test-environment-only, and cost-capped.
- Do not remove PaddleOCR/dependencies until shadow evaluation, cutover, rollback observation, and a separate approved cleanup phase.
- No production evidence may be sent before the data-residency, DPA, training, retention, deletion, subprocessor, incident, and government-data questions in the specification are approved.

Work phase by phase and stop at a failed gate. For this first task, implement **Phase 0 only**:

1. Parse and validate `OCR_API_OPENAPI.yaml` in a deterministic contract test, including resolution of every local `$ref`.
2. Identify the exact schemas/operations for model catalog, async/batch parse admission, durable jobs, job result retrieval, error responses, `Retry-After`, and canonical/raw results.
3. Add sanitized schema-valid fixtures for catalog response, batch admission, queued/running/succeeded/failed/indeterminate jobs, mixed-success batch children, canonical `openparser@1`, and raw PaddleOCR-VL response. Include recognition confidence present, confidence absent, layout-detection score only, `calibrated=false`, and all supported confidence scopes. Fixtures must contain no credentials or real evidence.
4. Inventory the current browser/device/mobile capture and upload paths, including canvas JPEG encoding, blob URL reconstruction, desktop double upload, mobile single upload, advisory checks, and authoritative server checks. Record exact current file/line evidence and contract compatibility requirements.
5. Write an ADR that records target architecture, upload-once scan/image intake, four-state quality decisions, officer override/audit, provider/client boundary, optional/scoped confidence, job state machine, database model proposal, idempotency canonicalization, key/tenant policy, artifact policy, coordinate policy, adaptive retry budget, security/privacy gate, feature modes (`local_paddle`, `openparser_shadow`, `openparser`), rollback, and unresolved vendor questions.
6. Inventory all other current code and tests affected. Confirm current Alembic heads and highlight collisions with user-owned migrations; do not create a migration in Phase 0.
7. Define the privacy-safe golden capture/OCR evaluation corpus format and measurable advisory latency, false-recapture, false-pass, field accuracy, citation, missing-confidence, latency, retry, and cost metrics. Do not add copyrighted or sensitive production images.
8. Add no runtime provider integration, credentials, network calls, database schema, capture behavior, or pipeline changes in Phase 0.

Phase 0 acceptance gate:

- the OpenAPI contract parses and all local references resolve;
- fixtures validate against the correct request/response schemas or the test clearly documents why a response wrapper must be validated differently;
- tests prove confidence is optional and distinguish detection from recognition; no fixture implies that an uncalibrated score is a probability;
- the ADR and inventory reconcile with current code rather than blindly copying paths;
- the ADR explicitly approves upload-once intake, original preservation, advisory versus authoritative quality, conservative rejection, and audited override semantics;
- tests are deterministic and offline;
- no secret or real label/evidence data is added;
- existing relevant tests still pass;
- only Phase 0 files and tests are changed, plus minimal test-only dependencies if truly necessary;
- `git diff` is reviewed to prove no unrelated user-owned work was modified.

Run the appropriate targeted tests, then the existing backend unit suite. Do not run live integration tests against shared infrastructure. Report any unavailable isolated infrastructure rather than claiming it passed.

At completion, return:

- exact files changed;
- contract operations/schemas selected;
- commands and results;
- ADR decisions and unresolved vendor/compliance blockers;
- risks discovered that require an update to the implementation specification;
- a Phase 1 proposal, but do not implement Phase 1 until explicitly authorized.

---

After Phase 0 is reviewed and accepted, give Claude Code this continuation prompt:

> Continue with exactly the next phase in `docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md`. Re-read the implementation brief and current git status, preserve all user-owned changes, verify the previous phase gate, implement only the stated phase, run its complete gate, stop on failure, and report changes, evidence, risks, and rollback. Do not proceed to a later phase without explicit authorization.
