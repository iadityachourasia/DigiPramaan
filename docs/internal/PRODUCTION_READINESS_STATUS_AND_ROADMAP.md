# DigiPramaan: Production Readiness — Status and Roadmap

> Written 2026-09-19, at the end of a multi-session engineering push covering two parallel tracks:
> **§T** (security-first backend hardening) and **OP** (OpenParser OCR migration, Phases 0–9).
> This document consolidates what's actually done (verified by tests/live runs, not just written),
> what's left, and a full forward roadmap to a production-grade, industry-ready system.
>
> Source material: `docs/internal/BACKEND_PRODUCTION_AUDIT_AND_REMEDIATION.md` (original audit,
> findings F-001–F-027), the session's own deep reconnaissance (findings N-1–N-22), and
> `docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md` (the OCR migration spec, 10 phases).
> Every "done" claim below is backed by a green test run or a live-verified call in this session —
> not just code that exists.

---

## 1. Executive summary

DigiPramaan has two engineering tracks that were run in parallel:

- **§T — security-first backend hardening.** Phase 1 (steps 1.1–1.4) is done: fail-closed
  object-level authorization, an audit event ledger, a unified records API contract, and the
  Activity Log API. Steps 1.5–1.10 (Admin Console, Grievance Portal, Analytics, closing the
  Next.js mock API in production, contract cleanup) and Phases P2–P5 (identity/abuse hardening,
  evidence integrity, compliance-decision correctness, durable processing at scale) are **not
  started**.
- **OP — OpenParser OCR migration.** Phases 0–7 and part of 9 are done, tested, and (for the
  parts meant to be live) verified against the real API. **`OCR_PROVIDER` now defaults to
  `openparser` (`paddleocr-vl-1.6`) and this was proven end-to-end in this session** — real
  OpenParser OCR → real Gemini structuring with new citation grounding → the deterministic rule
  engine → a compliance record, all against live services. Phase 8 (a *formal*, staged production
  cutover with canary/monitoring/rollback drill) was **not** run as a process — the switch was a
  direct default flip, which is functionally a cutover but skipped the staged safety net the spec
  describes. Phase 7's actual shadow *evaluation* (real quality/cost measurement on an approved
  dataset) never ran — only the comparison harness was built. **The §15 compliance/procurement
  gate — India data residency, retention/deletion SLA, DPA/subprocessor terms — remains entirely
  unanswered**, and real evidence images will now flow to a third-party OCR service without it.

- **Everything outside these two tracks** — the original reconnaissance's ~40 findings (F-001
  through F-027, N-1 through N-22) covering report integrity, migration baseline breakage, rate
  limiting, SSRF, JWT hardening, durable job processing, i18n, and the dual mock/real backend
  split — is **unchanged from when this session started**, except where §T P1 or an OP phase
  happened to touch the same code.

**Bottom line:** the core officer scan→verify flow works end to end today, and OCR quality should
improve materially now that OpenParser is live. But the system is not yet safe to call
"production, industry-ready" — object-level authorization only covers what §T P1 touched, the
Next.js mock backend still ships live in production, report generation is provably broken in the
deployed container, and the compliance gate for the new OCR vendor hasn't been addressed.

---

## 2. What's done (verified)

### 2.1 §T — Phase 1, steps 1.1–1.4

| Step | What | Evidence |
|---|---|---|
| 1.1 | Fail-closed authorization core (`services/authz/`), object-level scoping on every protected route, `PRODUCT_CATEGORIES` enum closing the Rule-3 bypass | Commit `4ded88c` |
| 1.2 | Audit event writing (`services/audit/emit.py`), migration 0007 (`actor_role`/`region`/`record_id`/`request_id` on `audit_events`) | Commit `4ded88c` |
| 1.3 | Unified records API contract (corrections/resolutions/verify all return `to_frontend_record`), Needs-Review flag + archive (migration 0008), resolution UI wired into `ExtractionView` | Commit `4ded88c` |
| 1.4 | Activity Log API (`GET /activity`, scoped, filtered, paginated) | Commit `4ded88c` |

**Not done:** 1.5 (Admin Console), 1.6 (Grievance Portal), 1.7 (Analytics + manufacturer bulk-flag),
1.8 (Reports list), 1.9 (close the Next.js mock API in production builds), 1.10 (contract cleanup).

### 2.2 OpenParser OCR migration — Phases 0–7, 9 (partial)

| Phase | What | Verified how |
|---|---|---|
| 0 | Contract validated against a real jsonschema validator; 20 fixtures; ADR with 12 open vendor questions recorded | 44 contract tests |
| 1 | Upload-once capture intake (desktop + mobile unified), 4-state quality model, officer override + audit | Unit + live browser walk |
| 2 | Typed config, redacted `httpx` client, retry/backoff, circuit breaker; `OpenParserKeyPool` for the 19-key multi-tenant set (each job pinned to its admitting key) | 72 tests; live catalog smoke test (all keys) |
| 3 | `ocr_provider_jobs` durable outbox — real `SELECT ... FOR UPDATE SKIP LOCKED`, CAS state transitions, stale-lease recovery, content-addressed artifacts | Real migration round-trip; real concurrency/crash matrix against disposable Postgres |
| 4 | Normalization adapter (`OcrElement`) — never fabricates confidence/coordinates, refuses unverifiable geometry | 56 tests incl. multilingual + perspective-refusal golden cases |
| 5 | Wired into `jobs/pipeline.py`'s `textExtraction` stage behind `OCR_PROVIDER`; `local_paddle` path byte-for-byte unchanged | `test_pipeline.py` unmodified/green; integration tests against real Postgres+MinIO |
| 6 | Gemini citation grounding (Unicode-aware, rejects unsupported citations) + `FieldReliability` signal — live in production now | 19 new tests incl. adversarial + Devanagari/Tamil cases |
| 7 | Shadow-comparison harness (read-only, no live run) | 9 tests incl. one against real persisted rows |
| 9 (partial) | OpenCV/Pillow made explicit dependencies | Compile + full suite |
| — | **`OCR_PROVIDER` default switched to `openparser`, live end-to-end run proven**: real OpenParser → real Gemini (grounded) → real rule engine → `ComplianceRecord` | Live smoke test, 2026-09-19, synthetic non-evidentiary images only |

Current automated suite: **655 unit/contract tests passing**, migration head `0010_ocr_provider_jobs`.

**Not done:** Phase 7's actual measurement run (needs an approved dataset — explicitly deferred by
the user). Phase 8 as a formal staged process (canary/monitoring/rollback drill — a direct default
flip happened instead). Phase 9's core task (removing Paddle — correctly blocked; `local_paddle`
is still the rollback path and several tests depend on it staying functional). The §15 compliance
gate (12 vendor questions in the ADR, all unanswered).

---

## 3. What's left — organized by what breaks first in production

### 3.1 Critical — blocks calling this "production ready" at all

1. **The §15 OpenParser compliance gate.** Real evidence (citizen/officer-submitted photos) now
   flows to a third-party OCR service with no signed-off data residency, retention/deletion SLA,
   or DPA/subprocessor terms. This is the single most urgent open item given OpenParser is now the
   *default*, not a future option. See §22 of the OpenParser spec for the exact 12 questions.
2. **F-002 / §T 1.9 — the Next.js mock API ships live in production** and trusts caller-supplied
   `userId`/`viewerId`/`actorId` in the request body. Anyone can forge identity against
   `/api/records/*/verify`, `/api/admin/*`, etc. Closing this (a `proxy.ts` 404 gate on `/api/*`
   outside dev/test) is §T step 1.9 — not started.
3. **F-003 — report generation is broken in the deployed container.** No Node/`scripts/` in the
   image, `shell=True` on POSIX, and the verifier is the generator (no independent verification).
   Officers cannot currently download a real PDF/DOCX report from a production deployment.
4. **F-001 remnants — object-level authorization outside what §T 1.1 touched.** Confirm no route
   added since (including every OP-Phase 5 addition, though those aren't officer-facing routes)
   regressed this. Re-run the authorization matrix test after any new route lands.
5. **F-004 — a fresh database cannot reach migration head.** Migration `0001` uses `create_all()`
   against *current* models; a genuinely empty database's `alembic upgrade head` still collides.
   Every phase this session verified round-trips from `0009`/`0010` onward only — the base is
   still broken. Blocks disaster recovery and spinning up a second environment.

### 3.2 High — real security/reliability gaps

6. **F-005 remnants** — confirm Rule 3's category-bypass fix (§T 1.1) is the only path; audit for
   any other client-trusted field that skips deterministic rules.
7. **F-006, F-009, F-010 — resource exhaustion, SSRF, JWT hardening.** No request-size limits on
   `POST /scans`, SSRF check-then-connect race in the e-commerce scraper, JWT algorithm taken from
   the unverified header, `?access_token=` in URLs/logs. This is §T P2, not started.
8. **F-011 — audit trail still incomplete outside what 1.2 covers.** Corrections/verify/resolution
   events are now written (1.2/1.3), but immutability is still app-level only (a verified record
   is mutable at the DB level).
9. **F-007 — no durable job system beyond OpenParser's own outbox.** Paddle-mode pipeline runs and
   report generation still use bare `BackgroundTasks` with no lease, resume, or reaper. If the
   OpenParser default is ever rolled back to `local_paddle`, this gap is fully exposed again.
10. **OP-Phase 8 as a real process.** Even though the default flip works, a production incident
    with no canary/rollback drill/operator runbook is a real operational risk. Worth doing the
    staged process retroactively — canary by region, monitor error/cost/latency SLOs, drill the
    rollback (`OCR_PROVIDER=local_paddle`) once for real.

### 3.3 Medium — correctness and completeness

11. **§T 1.5–1.8** — Admin Console, Grievance Portal, Analytics, manufacturer bulk-flag, Reports
    list. Each currently 403s or 404s for real users (mock-only today).
12. **N-1/N-2 status** — confirm still fixed after all the pipeline/OCR changes (resolution UI +
    unified record response were part of 1.3; worth one live re-walk).
13. **F-013/F-014/F-015, N-11** — compliance-decision correctness: structured Rule-5 exemptions,
    Gemini value-to-citation grounding (**OP-Phase 6 now does part of this** — citations are
    verified — but values still aren't cross-validated against deterministic parsers per spec
    §13), Rule 6(e)/unit-regex false positives need legal-domain review.
14. **OP-Phase 4's coordinate mapper** only handles pixel/normalized units live; point/inch
    (PDF-sourced) always refuse without a DPI this pipeline never supplies. Fine today (no PDF
    ingestion), but worth knowing before any PDF-upload feature is added.
15. **i18n** — Hindi message files are placeholder parity only; OCR/normalization is English-only
    despite Hindi being one of the two primary label languages this system exists to check.

### 3.4 Lower priority — scale, polish, hygiene

16. **F-020, F-022, F-025 — container/CI hardening.** Root container user, unpinned deps (no
    lockfile), CI builds without tests/scans, stale README test counts.
17. **F-012, N-21 — data residency/retention (general, not just OpenParser)**, sessionStorage
    JWT/refresh tokens with no CSP (XSS = full account takeover).
18. **OP-Phase 9's remainder** — once Phase 8 is formally stable and signed off: remove
    PaddleOCR code/packages/models, shrink and rescan the container image.
19. **Technical debt (§O)** — the dual mock/real backend (~40 Next.js route handlers, 5,128 lines
    of TypeScript stores) is still fully present; `ROLE_PERMISSIONS`/taxonomy/category-map
    duplication between Python and TypeScript is unchanged.

---

## 4. Full roadmap to production, industry-ready

Ordered by what actually blocks a real government deployment, not by what's easiest. Each phase
assumes the same discipline this session used throughout: plan → build → test against real
disposable infrastructure → verify live only with explicit scoped approval → report exact
counts → stop for review.

### Phase R1 — Close the two "this isn't real yet" gaps (do first, small, high leverage)
- Sign off or explicitly accept-as-risk the §15 OpenParser compliance gate (data residency,
  retention, DPA). This is a business/legal decision, not an engineering one, but it blocks
  everything downstream that touches real evidence.
- §T 1.9: gate `/api/*` behind `ENABLE_MOCK_API` in production builds (`proxy.ts` + a
  `next.config.ts` build-time guard). Small, mechanical, closes F-002 outright.
- F-004: freeze the Alembic 0001 baseline as explicit DDL (not `create_all()`), verified by a
  genuine empty-database `upgrade head` → `alembic check` → `downgrade base` → `upgrade head`
  round trip. Unblocks disaster recovery and a second environment.

### Phase R2 — Make the officer flow trustworthy end to end
- F-003: a deployable report renderer (multi-stage image with Node + the prebuilt renderer, or a
  separate renderer service), verifier attribution from `verified_by` (not the generator), public
  verify re-hashes stored bytes instead of trusting DB status alone.
- §T P2 (F-006/F-008/F-009/F-010/F-019): request size limits, move sync CPU/IO out of `async def`
  handlers, SSRF pinned egress, JWT algorithm allowlist + exact issuer, short-lived download
  tickets instead of `?access_token=`, security headers/CSP.
- Formalize OP-Phase 8 as a real process even though the default already flipped: canary by
  region if feasible, dashboards for OpenParser error rate/cost/latency, one real rollback drill,
  a short operator runbook (`OCR_PROVIDER=local_paddle` to roll back — document it, don't just
  know it).

### Phase R3 — Port the remaining mock-only surfaces (§T 1.5–1.10)
- Admin Console (team, thresholds, deactivate, reassign — needs `profiles.active` + jurisdiction
  hierarchy work), Grievance Portal (public, rate-limited, honeypot, cost-capped), Analytics
  (real SQL aggregates), manufacturer bulk-flag, Reports list.
- Close the loop: delete the now-unused mock store code for every surface once its real backend
  ships (don't leave the dual system running longer than needed once ported).

### Phase R4 — Evidence integrity and compliance-decision correctness
- F-011 DB-level enforcement: an append-only audit table constraint, optimistic version column on
  `compliance_records`/`violation_cases` for the verify-vs-worker race.
- F-013/F-014/F-015: structured Rule-5 exemptions (replace the client-category heuristic
  entirely), deterministic value validation for Gemini-extracted fields (dates, phone/email,
  units) layered on top of OP-Phase 6's citation grounding, legal-domain review of Rule 6(e)/unit
  regex false positives.
- OP-Phase 7 for real: get the compliance-approved dataset, run the actual shadow evaluation,
  measure against the spec's §19 thresholds before trusting OpenParser output at parity with (or
  better than) Paddle on Hindi/mixed-script/small-text labels specifically.
- Multilingual: a real Hindi/Devanagari OCR + normalization pass — OP-Phase 6's grounding already
  proved Unicode-safe; the gap is upstream (structuring prompt, normalization, UI labels).

### Phase R5 — Durable processing and scale
- F-007: a real durable queue (not just OpenParser's own outbox) for the Paddle-mode pipeline and
  report generation — lease, resume, reaper, so a process restart never loses work regardless of
  which OCR provider is active.
- SQL-level aggregates and indexes for `/dashboard`, `/companies`, `/products` (currently loads
  full result sets into Python).
- OP-Phase 9 completion (post R2's cutover stabilization): remove Paddle code/packages/models,
  shrink and rescan the container.

### Phase R6 — Operational and engineering hygiene
- F-020/F-022/F-025: non-root container user, a real lockfile, CI that runs tests + migration
  checks + vulnerability scans on every push (not just builds), README/doc truth pass.
- N-21: move JWT/refresh tokens out of `sessionStorage` (or add a real CSP as a stopgap), close
  the XSS-to-account-takeover path.
- Technical debt cleanup (§O): once R3 ports every real surface, delete the ~40 mock route
  handlers and `scan-pipeline-store.ts` outright; de-duplicate `ROLE_PERMISSIONS`/taxonomy/
  category-map between Python and TypeScript.
- i18n completion: real Hindi message translations (not placeholder parity).

---

## 5. How to keep working on this

This document is a snapshot. Before resuming any phase above:
- Re-run `pytest tests/unit tests/contract -q` and diff the count against §2.2's 655 baseline.
- Re-check `git log` for anything merged since 2026-09-19 that this document doesn't know about.
- For any OpenParser-touching work: confirm `OCR_PROVIDER` in the target environment before
  assuming which code path is live.
- For any §T P1-adjacent work: re-run the authorization matrix integration test
  (`tests/integration/test_authz_matrix.py`) after adding any new UUID-keyed route.
