# Digi Pramaan Backend Production Audit and Remediation Brief

**Audience:** Claude Code and the Digi Pramaan engineering team  
**Audit baseline:** commit `d7c3a0c4fcb6` on branch `ocr-resize-and-error-envelope-fix`  
**Audit date:** 14 September 2026  
**Reviewed scope:** 312 tracked backend-relevant files  
**Verdict:** Not ready for production deployment as a Government of India service  
**Purpose:** Implementation brief. This is a technical security and compliance assessment, not legal certification.

## 1. Instructions for Claude Code

Treat this file as the implementation backlog and acceptance specification. Do not attempt all phases in one change set.

1. Read `AGENTS.md` and `.claude/CLAUDE.md` before acting. This brief names the affected files, so follow their vexp routing rule rather than rediscovering the repository one file at a time.
2. Inspect `git status` before every phase. The baseline already contained user-owned modifications and untracked files. Preserve them. Do not reset, clean, overwrite, stage, or reformat unrelated work.
3. Implement one numbered phase at a time. Stop immediately if that phase's mandatory gate fails. Report the failure with the exact command and output; do not hide it by weakening a test.
4. Do not run destructive migrations or integration tests against a shared Supabase/PostgreSQL instance. Migration tests require a disposable PostgreSQL database identified explicitly as `TEST_DATABASE_URL`.
5. Do not use live Backblaze, Gemini, PaddleOCR, Supabase, Azure, or deployment credentials unless the user explicitly supplies a safe test environment and authorizes its use.
6. Do not preserve insecure wire compatibility. Where this brief removes caller-supplied identity or URL bearer tokens, update both implementations, clients, schemas, documentation, and tests in the same phase.
7. Add negative tests before or with each security fix. A passing happy-path test is not sufficient evidence that an authorization, concurrency, or failure-handling defect is resolved.
8. Never mark a phase complete until its acceptance criteria and mandatory commands pass. Record any unavailable environment-dependent checks as blocked, not passed.
9. Do not weaken jurisdiction, evidence, audit, or retention controls to keep demo behavior working. Production security takes precedence over mock compatibility.
10. Do not edit this audit to remove a finding. If implementation establishes that evidence is stale, add a short resolution note with the correcting commit and regression test.

## 2. Executive risk summary

The audit confirmed 28 findings:

| Severity | Count | Production meaning |
|---|---:|---|
| Critical | 3 | Direct authorization or legal-evidence failure; release is blocked. |
| High | 9 | Exploitable security, compliance, integrity, or availability risk; release is blocked. |
| Medium | 10 | Material correctness, scalability, operational, or maintainability failure. |
| Low | 4 | Defense-in-depth, validation, or diagnostic weakness. |
| Informational | 2 | Verified positive evidence or bounded dependency observation. |

Immediate release blockers are:

- Cross-jurisdiction object access and mutation in FastAPI.
- Unauthenticated production-built Next.js APIs that trust caller-supplied officer and administrator identities.
- False report verifier attribution, unverifiable artifacts, and a production container that cannot render reports.
- A fresh Alembic upgrade path that collides with its own later migrations.
- Caller-controlled category values that can mark the entire compliance ruleset not applicable.
- Unbounded upload, OCR, retry, and public API resource consumption.
- Non-durable background jobs that can strand or overwrite legal records.
- Bearer-token leakage in mobile URLs and unsafe object replacement transactions.
- DNS-rebinding SSRF in e-commerce ingestion.
- Weak JWT issuer and algorithm policy plus URL query access tokens.
- Audit and immutability claims without database enforcement.
- Unresolved India-region storage, retention, AI processing, and incident-response controls.

## 3. Audit evidence and limitations

### 3.1 Verification completed

| Check | Result |
|---|---|
| Python syntax and AST parsing | 175 files parsed; 0 syntax errors. |
| FastAPI default suite | 314 passed; 72 integration tests deselected; 6 warnings. |
| TypeScript | `tsc --noEmit` passed. |
| ESLint | Application, tests, scripts, and configuration passed when scoped away from a protected pytest cache directory. |
| Vitest | 132 tests passed in 13 files. |
| Next.js production build | Passed; 63 pages were produced and all 40 API route handlers were included. |
| Source mutation | No application source, schema, migration, or configuration was changed during the audit. |

### 3.2 Verification limitations

- The 72 integration tests were not run because the configured PostgreSQL, object-storage, and Gemini resources were non-local/shared. The Alembic round-trip test explicitly requires a disposable database or destructive-test authorization.
- No end-to-end production environment was available for Supabase, Backblaze B2, Gemini, PaddleOCR, Azure, or deployment checks.
- Python dependencies have no committed, hashed lockfile. Targeted advisory checks are recorded, but no result in this document represents an exhaustive software-composition clearance.
- Regulatory conclusions are implementation-risk assessments. Departmental security certification, privacy review, legal interpretation, and infrastructure accreditation remain external gates.

## 4. Architecture and trust boundaries

The system has two active server layers. FastAPI is intended to be authoritative for authentication, scanning, OCR, rule evaluation, reports, cases, records, risk, and storage. Next.js also exposes 40 server route handlers, many backed by process-local `Map` stores. Frontend API clients switch between these surfaces inconsistently, so a production build can combine authenticated FastAPI data with unauthenticated and non-durable Next.js mutations.

Primary trust boundaries:

1. Browser to Next.js route handlers.
2. Browser or Next.js client to FastAPI.
3. FastAPI JWT validation to Supabase identity and user profiles.
4. Officer jurisdiction to protected records, cases, reports, scans, products, companies, and batches.
5. Multipart uploads to Pillow, PaddleOCR, Gemini, and object storage.
6. User-supplied e-commerce URLs to outbound HTTP and DNS.
7. Web process to background OCR and report jobs.
8. PostgreSQL state to object-storage evidence and report bytes.
9. OCR/model output to legal-rule decisions and human verification.
10. Public verification and grievance endpoints to unauthenticated callers.

The required end state is one authoritative authenticated backend, fail-closed object authorization, durable asynchronous processing, immutable and verifiable evidence, versioned legal decisions, bounded resource use, and India-appropriate operational controls.

## 5. Finding catalogue

### F-001 Systemic cross-jurisdiction object authorization failure

**Severity:** Critical  
**Classification:** Confirmed security defect; OWASP API1 BOLA  
**Release impact:** Blocks production  
**Affected workflows:** Records, corrections, verification, enforcement flags, cases, reports, pipeline retry, calibration, explanations, e-commerce batches, product DNA, and company profiles.

**Evidence**

- `backend/app/services/scope.py:31-41` applies no restriction when jurisdiction level is missing, national, or region is empty.
- `backend/app/api/v1/records.py:161-220`, `226-267`, `294-359`, `487-554`, and `574-607` load record objects directly for correction, verification, resolution, detail, enforcement flagging, and retry.
- `backend/app/api/v1/cases.py:94-147` loads and transitions cases without applying jurisdiction scope.
- `backend/app/api/v1/scans.py:277-332` and `356-442` expose pipeline read, retry, and calibration operations without object scope.
- `backend/app/api/v1/reports.py:67-97` generates reports from an unscoped record lookup.
- `backend/app/api/v1/explanations.py:66-74` loads a record without scope.
- `backend/app/services/product_dna/dna.py:39-112` and `backend/app/services/company_profile/aggregate.py:46-122` can return product or company metadata even when the caller has no visible records.

**Failure scenario and impact**

An authenticated state or district officer obtains another record UUID from logs, links, enumeration, or a shared screenshot. Direct calls can read the record, modify extracted fields, verify it, flag it for enforcement, transition its case, retry paid OCR/AI work, or produce a report. An incomplete user profile can receive global access because the shared scope helper fails open. This breaches jurisdiction isolation and can corrupt enforcement evidence.

**Root cause**

Authorization is treated as an optional collection-query concern. Domain objects do not have a mandatory repository-level visibility predicate, and bare `db.get()` calls bypass scope.

**Required target design**

- Add one fail-closed authorization policy that converts the authenticated profile into an explicit scope predicate.
- National access must be an explicit role/claim, never inferred from missing profile data.
- Every protected object query must include visibility and, where relevant, assignment predicates before materialization.
- Return the same scoped `404` for nonexistent and inaccessible IDs to limit enumeration.
- Separate read, correct, verify, enforcement, report, retry, calibration, and case-transition permissions.

**Implementation tasks**

1. Replace the current helper with a typed scope object that rejects incomplete jurisdiction profiles.
2. Add scoped repository functions for records, cases, scans, batches, reports, products, and legal entities.
3. Remove bare protected-object `db.get()` usage from API handlers and services.
4. Apply scope to aggregate metadata before returning product/company identity.
5. Add explicit case assignment and escalation rules.
6. Log denied access using actor ID, object type, jurisdiction, action, and request ID without logging sensitive object contents.

**Migration and compatibility**

No public response shape needs to change. Profiles with incomplete jurisdiction data will lose access; provide an administrative repair report before rollout. Do not add a compatibility fallback that restores global access.

**Required tests**

- Cross-jurisdiction negative tests for every UUID endpoint.
- National, state, district, incomplete-profile, disabled-user, and mismatched-assignment matrices.
- Product/company aggregate tests with zero visible records.
- Tests proving inaccessible and nonexistent IDs have indistinguishable status and response shapes.

**Monitoring and rollback**

Measure authorization denials by route and jurisdiction. Roll back only the deployment, never the fail-closed database policy. A spike caused by incomplete profiles must be resolved by profile repair.

**Acceptance criteria**

No protected endpoint can load or mutate an object before applying authorization. Every negative matrix passes, and static review finds no unapproved bare lookup for protected models.

### F-002 Production-exposed Next.js APIs permit identity impersonation

**Severity:** Critical  
**Classification:** Confirmed authentication and authorization defect  
**Release impact:** Blocks production  
**Affected workflows:** Verification, correction, archive, review flags, enforcement, reports, thresholds, team administration, deactivation, pipelines, grievances, and mobile sessions.

**Evidence**

- `src/app/api/records/[id]/verify/route.ts:10-29` explicitly relies on a UI role gate and accepts `userId` from the body.
- `src/app/api/records/[id]/corrections/route.ts:24-39` accepts caller identity.
- `src/app/api/admin/thresholds/route.ts:7-20` trusts `viewerId` and `actorId` against fixtures.
- `src/app/api/admin/users/[id]/deactivate/route.ts:4-9` has no authenticated administrative boundary.
- `src/lib/server/scan-pipeline-store.ts:1313-1337` deliberately returns all data for a missing or unknown viewer.
- `src/lib/server/report-store.ts:411-419` permits a missing or unknown viewer.
- `tests/unit/jurisdiction.test.ts:70-72` asserts fail-open behavior as expected.
- `src/lib/api/records.ts:165-234` and `src/lib/api/manufacturers.ts:74-83` continue to call mock routes for selected operations even in real-backend mode.

**Failure scenario and impact**

An unauthenticated caller supplies a known fixture/user ID and performs privileged mutations. The production build confirmed that these handlers are shipped. Process-local stores also diverge between replicas, creating conflicting records and audit trails.

**Root cause**

Demo route handlers became a production server surface. They confuse client-side identity hints with authenticated server context and deliberately preserve fail-open behavior.

**Required target design**

- Production builds expose no authoritative mock mutation endpoint.
- Server identity is derived only from a verified session or bearer token.
- FastAPI is the single authoritative implementation unless a Next.js route is a strictly authenticated proxy.
- Mock mode is a development-only build capability with a startup/build failure if enabled in production.

**Implementation tasks**

1. Inventory every `src/app/api` route and classify it as remove, authenticated proxy, or public bounded endpoint.
2. Remove `userId`, `viewerId`, and `actorId` from privileged wire contracts.
3. Update API clients to call authoritative FastAPI endpoints consistently.
4. Replace fail-open stores and tests with fail-closed behavior.
5. Add production-mode configuration validation and a build test that rejects enabled mock stores.

**Migration and compatibility**

This is an intentional breaking contract change. Update callers atomically. During rollout, deploy the authenticated backend endpoints before switching clients; never accept both caller identity and server identity.

**Required tests**

Anonymous calls, forged IDs, unknown viewers, disabled users, cross-jurisdiction users, CSRF where cookie sessions are used, and a production route inventory test.

**Acceptance criteria**

No privileged request accepts actor identity from request data. Production mode contains no process-local authoritative store, and all negative access tests pass.

### F-003 Reports do not satisfy authenticity or immutability claims

**Severity:** Critical  
**Classification:** Confirmed legal-evidence integrity and availability defect  
**Release impact:** Blocks production  
**Affected workflows:** Verification reports, public verification, downloads, audit evidence, and container deployment.

**Evidence**

- `backend/app/services/reports/snapshot.py:431-452` builds officer verification from the report generator rather than `record.verified_by`.
- `backend/app/jobs/reports.py:120-126` passes the generator profile into the snapshot.
- `backend/Dockerfile:1-24` installs only the Python backend while `backend/app/jobs/reports.py:36-96` requires a repository-level TypeScript renderer, logo, Node.js, `npx`, and `tsx`.
- `backend/app/api/v1/reports.py:216-252` declares a completed report valid using database state and the stored hash without retrieving and rehashing the object.
- `src/lib/server/report-store.ts:394-458` re-resolves current report scope and re-renders downloads instead of retaining exact generated bytes.
- `backend/app/services/reports/images.py:113-117` silently omits unavailable evidence images.

**Failure scenario and impact**

A report generated by a different officer falsely names that officer as the verifier. A modified or deleted object can still pass public verification. Next.js can return different bytes for the same report ID. The supplied production container cannot execute the renderer. These failures make the report unsuitable as enforcement evidence.

**Root cause**

The system treats a mutable database row and object key as an immutable signed artifact. Generation, evidence retrieval, upload, completion, download, and verification are not one coherent integrity protocol.

**Required target design**

- Freeze a canonical report manifest containing record version, actual verifier, ruleset/version, evidence hashes, source timestamps, model provenance, and renderer version.
- Generate exact bytes once, hash them, sign the manifest, upload to versioned/WORM-capable storage, and atomically mark completion.
- Public verification and download must fetch and verify current bytes and signature.
- Required evidence retrieval failure must fail generation rather than silently degrade it.
- The production image must contain a tested renderer or use one maintained backend-native renderer.

**Implementation tasks**

1. Resolve `record.verified_by` to the verifier profile and separate generator metadata.
2. Add immutable manifest, artifact hash, signature, key ID, ruleset version, renderer version, and record version fields.
3. Use a `GENERATING -> UPLOADED -> VERIFIED -> COMPLETED` transactional lifecycle with cleanup for failures.
4. Add storage object version/object-lock policy and deny overwrite.
5. Build a multi-stage image containing required rendering assets, or replace the Node subprocess.
6. Remove or disable the Next.js mock report authority.

**Migration and compatibility**

Legacy reports cannot be retroactively claimed as cryptographically verified. Mark them `LEGACY_UNVERIFIED`; regenerate only from a retained historical snapshot where legally permitted. Version the verification response rather than silently changing the meaning of `VALID`.

**Required tests**

Generator differs from verifier, modified object, deleted object, wrong signature, missing image, repeated download byte equality, record correction after report generation, container smoke generation, and interrupted upload lifecycle.

**Acceptance criteria**

A completed report is byte-stable, names the true verifier, includes all mandatory evidence, renders in the production image, and fails verification after any artifact or manifest mutation.

### F-004 Fresh Alembic upgrade path is structurally broken

**Severity:** High  
**Classification:** Confirmed deployment and disaster-recovery defect  
**Release impact:** Blocks production

**Evidence:** `backend/alembic/versions/0001_mvp_schema.py:22-74` dynamically creates current SQLAlchemy metadata. Migrations `0002` through `0006` then create tables or columns already present in that metadata: `0002_rule_explanations.py:29-55`, `0003_product_identifiers.py:28-60`, `0004_ecommerce_sourcing.py:30-63`, `0005_mobile_upload_sessions.py:29-68`, and `0006_report_lifecycle.py:37-48`. The destructive round-trip test at `backend/tests/integration/test_alembic_roundtrip.py:61-103` is deselected by default.

**Scenario and impact:** A blank database created during deployment or recovery upgrades through `0001`, then collides with later migrations. Greenfield deployment and disaster recovery are unreliable.

**Target design and tasks:** Replace dynamic baseline behavior with frozen reviewed DDL or a deliberate squashed baseline. Create a disposable PostgreSQL migration job that upgrades blank-to-head, validates schema against metadata, downgrades where supported, and upgrades again. Add migration ownership, backup, rollback, and expand/contract rules.

**Compatibility:** Existing databases need a stamped transition plan based on inspected schema, not blind re-execution. Produce a preflight report before changing revision history.

**Tests and acceptance:** A blank database reaches head; an existing baseline transitions without data loss; schema comparison is clean; rollback is rehearsed. No migration imports current model metadata to define historical DDL.

### F-005 Caller-controlled category can bypass all compliance checks

**Severity:** High  
**Classification:** Confirmed business-rule and legal-decision defect  
**Release impact:** Blocks production

**Evidence:** Category and region are accepted from caller input in `backend/app/api/v1/scans.py:261-271`, `backend/app/api/v1/ecommerce.py:50-66` and `205-253`, and `backend/app/api/v1/mobile_handoff.py:58-63` and `264-265`. `backend/app/services/rules/checks.py:669-702` marks Industrial/Institutional or quantities above 25 kg/L not applicable. `backend/app/services/rules/aggregate.py:48-68` then short-circuits the whole record to `Not Applicable`.

**Scenario and impact:** A caller submits `Industrial` and bypasses every declaration rule. A quantity heuristic can also create an unsupported exemption.

**Target design and tasks:** Introduce a versioned category enum/catalog, derive jurisdiction from the authenticated profile, and represent exemptions as structured claims with evidence, legal basis, rule version, reviewer, timestamp, and supervisor approval. A heuristic may request review but must never create the exemption. Remove Rule 3 aggregation short-circuit unless a verified exemption object exists.

**Compatibility:** Existing not-applicable records require a review migration and cannot be trusted automatically.

**Tests and acceptance:** Malicious category strings, mixed case/Unicode values, quantities above thresholds, absent exemption evidence, supervisor denial, and historical rule versions. No request field alone can suppress the ruleset.

### F-006 Upload and inference endpoints allow resource exhaustion

**Severity:** High  
**Classification:** Confirmed availability and cost-control defect; OWASP API4  
**Release impact:** Blocks public exposure

**Evidence:** `backend/app/api/v1/scans.py:228-229` and `261` read complete uploads; `backend/app/api/v1/mobile_handoff.py:333-345` checks size after reading; `backend/app/services/image_quality.py:81-83` decodes without explicit dimension or pixel limits. Pipeline, evidence, and report downloads also buffer complete objects. `selected_urls` is unbounded, and login/upload/OCR/Gemini/retry/public verification endpoints have no common rate or cost limit.

**Target design and tasks:** Enforce edge and application quotas, reject excessive `Content-Length`, stream with a hard byte counter for chunked uploads, validate magic bytes and allowed codecs, cap dimensions/pixels/frames, isolate decoding, bound URL lists, stream downloads, and apply per-actor/IP/tenant concurrency and cost budgets. Use `429` with bounded retry metadata and `413` for size violations.

**Compatibility:** Publish explicit limits in OpenAPI and clients. Do not silently truncate uploads or lists.

**Tests and acceptance:** Oversized declared and chunked bodies, decompression bombs, forged MIME, malformed images, thousands of URLs, concurrent retries, and quota reset. Memory and external-model calls remain bounded under adversarial inputs.

### F-007 Background jobs are non-durable and can overwrite verified state

**Severity:** High  
**Classification:** Confirmed reliability and integrity defect  
**Release impact:** Blocks production processing

**Evidence:** `backend/app/jobs/pipeline.py:9-14` states that no automatic resume exists. Scan, mobile, and report work uses FastAPI `BackgroundTasks`. Retry supports failed rather than abandoned in-progress work. `backend/app/jobs/pipeline.py:423-430` writes extracted state back to the compliance record and can overwrite a concurrently verified record. OCR and structuring may be re-run non-deterministically.

**Target design and tasks:** Use a durable queue plus transactional outbox. Jobs require idempotency keys, attempt records, leases, heartbeats, timeouts, exponential backoff, dead-letter state, and reapers. Persist stage inputs/outputs so resume does not repeat completed external calls. Use optimistic versions or row locks and forbid workers from mutating a verified record unless a new version is explicitly created.

**Compatibility:** Convert existing terminal and stale rows into explicit job records. Preserve historical failure summaries while sanitizing internal exceptions.

**Tests and acceptance:** Kill workers during every stage, duplicate delivery, delayed delivery, lease expiry, verify-versus-worker race, retry after partial completion, external timeout, and dead-letter recovery. No job remains indefinitely in progress and no stale worker can change verified state.

### F-008 Mobile handoff leaks bearer tokens and can corrupt evidence replacement

**Severity:** High  
**Classification:** Confirmed token and transactional-integrity defect  
**Release impact:** Blocks production mobile handoff

**Evidence:** `backend/app/api/v1/mobile_handoff.py:156-163` places a raw token in a URL path; token routes appear around lines 299, 316, and 413. `backend/app/core/logging.py:47-67` logs the request path, contradicting `backend/app/services/mobile_handoff/tokens.py:5-10`. Replacement in `mobile_handoff.py:368-404` deletes the old object before database commit. Models lack database-enforced uniqueness for active session and evidence angle.

**Target design and tasks:** Exchange the QR secret once for a short-lived session credential, send it in an authorization header, set strict referrer policy, redact secrets at ingress, hash stored tokens, and rotate after use. Add partial unique indexes for one active session per scan and one current evidence item per angle. Upload versioned new objects, commit the pointer, then delete old versions through an outbox.

**Compatibility:** Support legacy tokens only during a short, explicitly measured transition and never log them. Existing duplicate rows require deterministic reconciliation before adding constraints.

**Tests and acceptance:** Log inspection, replay, expiry, concurrent session creation, concurrent same-angle upload, commit failure, storage failure, cleanup retry, and repeated finalize. No usable secret appears in URL or logs, and database/object state remains consistent after injected failures.

### F-009 E-commerce SSRF guard is vulnerable to DNS rebinding

**Severity:** High  
**Classification:** Confirmed server-side request-forgery weakness  
**Release impact:** Blocks arbitrary URL ingestion

**Evidence:** `backend/app/services/ecommerce/ssrf_guard.py:53-90` resolves and checks a host, while `backend/app/services/ecommerce/fetcher.py:47-60` lets HTTPX resolve it again. Redirects repeat the same time-of-check/time-of-use pattern. Default proxy environment behavior is not disabled. `backend/app/services/ecommerce/category.py:24-30` approximates registrable domains using the final two labels.

**Target design and tasks:** Prefer a controlled egress proxy with an explicit allow/deny policy. Otherwise pin a vetted IP for the connection while preserving Host and TLS SNI, disable environment proxy trust, validate every redirect, reject userinfo and ambiguous ports, normalize IDNs, enforce scheme/port/body/time limits, and use a public-suffix library for site comparison.

**Compatibility:** Maintain a documented allowlist exception process rather than weakening private-network checks.

**Tests and acceptance:** DNS rebinding, IPv4/IPv6 private ranges, mapped IPv6, decimal/octal IP encodings, redirects to metadata services, malicious proxy environment, `co.in` domains, invalid ports, and oversized responses. The connected peer must be the vetted address.

### F-010 JWT validation and access-token transport are unsafe

**Severity:** High  
**Classification:** Confirmed authentication hardening defect  
**Release impact:** Blocks production authentication clearance

**Evidence:** `backend/app/core/security.py:55-59` reads the unverified header, and asymmetric validation selects that header algorithm around lines 83-89. Issuer verification is disabled and replaced by optional substring logic at lines 100-106. `backend/app/api/deps/auth.py:70-90`, `src/lib/api/records.ts:44-54`, and `src/lib/api/reports.ts:348-360` support access tokens in query strings. `backend/app/api/v1/auth.py:82-110` has no visible brute-force control; `rememberMe` is accepted but not implemented.

**Target design and tasks:** Configure an exact algorithm allowlist per key type, require exact issuer and audience, validate temporal claims with bounded clock skew, cache/rotate JWKS safely, and map identity-provider failures to sanitized authentication errors. Remove query bearer tokens; use headers or short-lived single-purpose download tickets. Add rate limits, credential-stuffing protections, generic failure behavior, and defined session-duration semantics.

**Compatibility:** Change download clients and endpoints atomically. Deprecate old URLs with a short rejection-only telemetry period, not dual acceptance of long-lived tokens.

**Tests and acceptance:** Algorithm substitution, missing/wrong issuer, missing/wrong audience, expired/not-before tokens, unknown key, JWKS outage, query-token rejection, download ticket replay, and brute-force limits.

### F-011 Audit history and record immutability are not enforced

**Severity:** High  
**Classification:** Confirmed evidence-governance defect  
**Release impact:** Blocks legal-evidence claims

**Evidence:** `backend/app/db/models/compliance_record.py:11-17` describes immutability as application behavior. Correction and verification handlers use unlocked read-check-write. `backend/app/db/models/audit_event.py:1-4` states append-only behavior without database enforcement. Actor references are weak, and `backend/app/services/records/serialize.py:91-106` synthesizes a short audit trail from timestamps rather than returning authoritative events.

**Target design and tasks:** Use immutable record versions rather than overwriting verified facts. Add optimistic version columns and database policies/triggers that prohibit update/delete of protected event rows. Store complete actor, action, reason, source version, request ID, timestamp, before/after hashes, and related artifact IDs. Hash-chain or sign event batches and export the actual event ledger.

**Compatibility:** Snapshot legacy mutable records as version zero and mark unverifiable historical gaps. Do not fabricate missing past events.

**Tests and acceptance:** Concurrent corrections, verify-versus-correct, direct SQL update/delete denial, missing actor, event-chain tamper, replay, serializer completeness, and historical version retrieval. Every legal state change produces one durable attributable event.

### F-012 Data residency, privacy lifecycle, and incident controls are unresolved

**Severity:** High  
**Classification:** Architectural and compliance risk  
**Release impact:** Blocks Government of India production approval pending formal review

**Evidence:** Configuration and documentation target Backblaze B2 for evidence and reports; Backblaze documents US, EU, and Canada regions rather than India. OCR text and potentially images are sent to Gemini without implemented data-classification, minimization, regional-processing, retention, deletion, or provenance controls. No repository implementation defines retention schedules, deletion workflows, India-held log retention, breach response, backup residency, or DR exercises.

**Target design and tasks:** Produce a data inventory and flow map; classify evidence, PII, credentials, logs, and model inputs; move regulated primary and backup storage to an approved India region; define retention/legal-hold/deletion policies; record processing purpose and model/vendor provenance; minimize or redact AI inputs; establish processor agreements; implement access reviews; and create incident reporting and 180-day India log-retention procedures where applicable.

**Compatibility:** Migrate objects with checksum verification, dual-read only during a bounded transition, and documented deletion from the former provider after acceptance. Preserve legal holds.

**Tests and acceptance:** Residency configuration tests, retention scheduler, erasure with legal-hold exception, restore drill, vendor outage, incident tabletop, access review, and evidence checksum reconciliation. Production approval includes departmental security, privacy, legal, and infrastructure sign-off.

### F-013 Product identity normalization can merge different products

**Severity:** Medium  
**Classification:** Confirmed data-integrity defect

**Evidence:** `backend/app/services/normalization.py:31-56` removes unit identity so values such as 1 kg and 1 L can share a normalized quantity. `normalization.py:17-26` strips non-ASCII scripts, allowing Hindi or other Indian names to collapse. `backend/app/services/product_dna/identity.py:106-116` lets a checksum-valid existing barcode override conflicting label identity. Lines 148-163 swallow identifier attachment integrity errors and may return a local product after a concurrent conflicting insert.

**Required solution:** Canonicalize quantity as value plus dimension and unit; preserve Unicode using NFKC/case folding and optional transliteration as a separate search key; treat barcode-label conflict as review state; use transactional upsert returning the database winner; and add unique normalized legal-entity keys only after collision analysis.

**Tests and acceptance:** Cross-unit values, Devanagari names, confusables, empty normalization, concurrent barcode attachment, and conflicting barcode/label identity. Distinct physical products cannot share a canonical identity solely because units or script were removed.

### F-014 Legal-rule results are weakly bound to evidence and time

**Severity:** Medium  
**Classification:** Confirmed correctness risk requiring legal-domain validation

**Evidence:** `backend/app/services/rules/aggregate.py:104-124` retains an officer resolution when the raw status remains the same even if evidence changed. `backend/app/services/rules/checks.py:391-437` treats OCR confidence as a legal readability signal. Lines 92-135 allow total OCR blocks rather than declaration-specific evidence to justify absence. Address, quantity unit, origin, and tax-inclusive-price checks are narrow regular expressions. The report stores a static ruleset string rather than a durable evaluation version.

**Required solution:** Create versioned, effective-dated rule definitions reviewed against current official Legal Metrology amendments. Each decision must bind to declaration-specific evidence spans, image IDs/hashes, extraction version, rule version, and record version. Corrections affecting evidence invalidate prior resolution. Ambiguous or unsupported cases become human review, not pass/fail/not-applicable.

**Tests and acceptance:** Official positive/negative fixtures per rule/version, changed evidence, missing declaration-specific evidence, multilingual formats, alternate valid address/quantity/price representations, and amendment effective dates. Legal subject-matter review signs off each production ruleset.

### F-015 OCR and Gemini output lack sufficient provenance and trust controls

**Severity:** Medium  
**Classification:** Confirmed AI correctness and governance weakness

**Evidence:** `backend/app/services/ocr/paddle.py:79-85` initializes English-only OCR. `backend/app/services/ocr/gemini.py:85-104` embeds untrusted OCR content in model prompts. Invalid evidence indexes may be dropped while values remain. The image fallback uses `image/jpeg` for all formats around line 201. `backend/app/services/gemini_client.py:22-38` retries broad exception classes across projects, and `backend/app/services/extraction/adapter.py:116` can assign misleading source-engine defaults.

**Required solution:** Add required Indian-language OCR profiles; delimit untrusted label text; use strict structured output; verify every extracted value against cited source spans; preserve raw OCR and model responses with hashes; record provider/model/prompt/schema versions; use correct MIME; classify retryable errors; and require review for unsupported or uncited values.

**Tests and acceptance:** Hindi and mixed-script labels, prompt injection printed on packaging, fabricated fields, invalid evidence references, PNG/WebP inputs, model timeout/quota errors, duplicate retries, and provenance export. No legal field is accepted without valid evidence linkage.

### F-016 Case transitions can race and retain inconsistent resolution state

**Severity:** Medium  
**Classification:** Confirmed workflow-integrity defect

**Evidence:** `backend/app/api/v1/cases.py:106-147` uses unlocked read-modify-write and swallows risk recomputation failures. `backend/app/services/cases/workflow.py:29` permits resolved-to-reinspection transitions, while the handler does not clear `resolved_at` around `cases.py:127-130`. One broad permission governs multiple case actions.

**Required solution:** Use a versioned state machine with row locking or compare-and-swap, distinct permissions, assignment checks, transition reason, atomic audit/risk updates, and state-specific timestamp invariants. Move side effects to an outbox if they cannot be part of the transaction.

**Tests and acceptance:** Concurrent contradictory transitions, reopen resolved case, unauthorized assignment, risk failure, duplicate request, stale version, and timestamp invariants. Exactly one valid transition wins and all related state/event writes are consistent.

### F-017 FastAPI and TypeScript contracts have material drift

**Severity:** Medium  
**Classification:** Confirmed integration and maintainability defect

**Evidence:** Most FastAPI routes lack response models. `src/lib/constants/api-endpoints.ts` describes routes that are absent or mock-only in FastAPI, including selected analytics, manufacturer, report, grievance, and record actions. `backend/app/services/records/serialize.py:160-162` always serializes selected e-commerce source fields as null. Several clients route only some operations to FastAPI.

**Required solution:** Make OpenAPI the source of truth; define response models and error envelopes for every endpoint; generate TypeScript clients/types; prohibit handwritten duplicate contracts; and add a production-mode route capability matrix. Version intentional breaking changes.

**Tests and acceptance:** OpenAPI snapshot, generated-client compile, response validation, error-contract tests, nullability checks, and end-to-end real-mode workflows. CI fails on ungenerated contract drift or an undocumented mock-only operation.

### F-018 List and dashboard queries will not scale

**Severity:** Medium  
**Classification:** Confirmed performance risk

**Evidence:** `backend/app/services/records/serialize.py:69-72` and `115-129` issue evidence, product-link, and case lookups during each record serialization. `backend/app/api/v1/dashboard.py:140` loads all scoped records into Python for aggregation. Company and case lists are unpaginated; record pages allow large offsets.

**Required solution:** Use select-in/joined loading or dedicated projections, aggregate KPIs in SQL, add bounded cursor pagination, cap export sizes, create indexes matching jurisdiction/status/date filters, and define query budgets.

**Tests and acceptance:** Query-count assertions, execution plans, 100k/1m-row representative data, deep pagination, concurrent dashboards, and timeout behavior. Query count remains constant per page and latency meets an agreed SLO without loading the full jurisdiction dataset.

### F-019 Production configuration and observability fail closed inconsistently

**Severity:** Medium  
**Classification:** Confirmed operational-security weakness

**Evidence:** `backend/app/core/config.py:29-55` defaults to development behavior, optional database SSL, and automatic bucket creation. `backend/app/main.py:57-61` enables credentials with unrestricted methods and headers, and configuration can admit wildcard origins. `backend/app/api/v1/health.py:33-48` returns raw readiness exceptions. `backend/app/core/errors.py:101-108` does not log the original unhandled exception. `backend/app/core/logging.py:48` accepts an unbounded unsanitized request ID.

**Required solution:** Add production startup validation for environment, exact CORS origins, TLS, secret strength, storage policy, disabled debug endpoints, and positive resource limits. Separate public liveness from authenticated/operator readiness. Emit structured sanitized logs, bounded request IDs, metrics, traces, security events, SLOs, alerts, and audit-log retention.

**Tests and acceptance:** Invalid production configurations fail startup; wildcard credentialed CORS is rejected; health responses reveal no vendor details; exceptions retain server diagnostics; malicious request IDs cannot inject or amplify logs; alerts fire in staging drills.

### F-020 Deployment, dependency, backup, and rollback controls are incomplete

**Severity:** Medium  
**Classification:** Confirmed supply-chain and operational gap

**Evidence:** `backend/Dockerfile:1-24` runs as root, uses a mutable base, retains build tooling, and lacks healthcheck/read-only/runtime hardening. `backend/pyproject.toml:6-43` uses broad lower bounds without a lock or hashes. `.github/workflows/backend-deploy.yml:11-32` builds and pushes from `master` without tests, migration validation, SAST, secret/dependency/container scans, SBOM, signing, approval, deployment verification, or rollback. Compose exposes default development credentials. No checked-in backup/restore or DR exercise exists.

**Required solution:** Multi-stage pinned image, non-root user, minimal runtime, read-only filesystem, healthcheck, resource limits, locked/hashed dependencies, SBOM, provenance and signing, secret/SAST/SCA/container scans, mandatory tests, immutable image tags, environment approvals, staged rollout, migration preflight, backups, restore drills, and documented rollback.

**Tests and acceptance:** Container smoke and report generation, vulnerability policy, signature verification, fresh migration, restore rehearsal, canary rollback, and deployment without `latest`. CI must prevent image publication when any mandatory gate fails.

### F-021 Public grievance and other process-local stores are non-durable

**Severity:** Medium  
**Classification:** Confirmed reliability, privacy, and abuse-control defect

**Evidence:** Process-local maps exist in `src/lib/server/grievance-store.ts:66-120`, `mobile-session-store.ts`, `report-store.ts`, `ecommerce-store.ts`, `scan-pipeline-store.ts`, and `admin-store.ts`. Grievance throttling trusts forwarded IP input around `src/app/api/grievances/route.ts:47-54`. Citizen data and data URLs can be retained in memory without durable retention or deletion policy.

**Required solution:** Remove production authority from process-local stores. Persist required workflows in the authenticated backend with encrypted durable storage, explicit retention, idempotency, pagination, audit, and trusted-proxy-aware rate limiting. Bound request bodies and attachment handling.

**Tests and acceptance:** Multi-replica consistency, restart recovery, spoofed forwarding headers, duplicate grievance, retention expiry, deletion/legal hold, and sensitive logging. No production workflow depends on a JavaScript `Map` for authoritative state.

### F-022 Public documentation materially overstates implemented guarantees

**Severity:** Medium  
**Classification:** Confirmed documentation and governance drift

**Evidence:** `README.md:74` claims deterministic and auditable reports; line 95 says reports are generated once and never regenerated; line 291 contains a stale backend test count; line 304 says the container ships everything required; lines 308-313 claim universal scoping, immutable reports, private storage, and authenticity guarantees. `docs/internal/BACKEND_HANDOFF.md:818` and nearby sections more accurately describe unauthenticated Next.js behavior.

**Required solution:** Replace claims with verified current behavior and clearly label demo versus production capability. Generate test counts and endpoint capability tables in CI where practical. Add an architecture decision record for the authoritative backend and a control-evidence index linking each security claim to tests/configuration.

**Tests and acceptance:** Documentation link/check scripts, generated test summary, production capability review, and security/legal approval of externally visible claims. No README statement may claim a control that lacks executable evidence.

### F-023 Error details and request metadata can leak or pollute diagnostics

**Severity:** Low  
**Classification:** Confirmed defense-in-depth weakness

**Evidence:** Pipeline and report failure reasons store broad exception strings that can surface vendor or internal details. Readiness returns raw dependency errors. Request IDs are accepted without length or character bounds. The suite warns about deprecated HTTP 413 usage.

**Required solution:** Map internal exceptions to stable public error codes, retain full details only in protected logs, cap and sanitize correlation IDs, redact secrets/URLs, and update deprecated response APIs.

**Tests and acceptance:** Secret-bearing exceptions, multiline request IDs, oversized IDs, binary text, vendor outages, and stable error-envelope snapshots. Public responses and database-visible failure reasons contain no sensitive internals.

### F-024 Report metadata is not generated from one canonical clock and ruleset

**Severity:** Low  
**Classification:** Confirmed consistency weakness

**Evidence:** `backend/app/services/reports/snapshot.py:112-120` and `455-465` generate related timestamps independently. Report creation and completion semantics differ, and the ruleset version is a static string rather than the persisted evaluation version. `backend/.env.example:65-66` and `backend/app/core/config.py:101-106` name different Gemini model defaults.

**Required solution:** Generate one canonical UTC timestamp set per lifecycle transition, persist the exact evaluation/model/prompt/renderer versions, and make environment templates derive from validated settings documentation.

**Tests and acceptance:** Frozen-clock snapshots, timezone handling, ruleset/model version round-trip, and configuration-template parity.

### F-025 Filter and pagination validation is inconsistent

**Severity:** Low  
**Classification:** Confirmed API correctness weakness

**Evidence:** `backend/app/api/v1/records.py:478-484` silently ignores invalid date filters. Pagination normalization occurs after count work and supports large offsets. Several collections have no explicit bounds.

**Required solution:** Return structured `422` errors for malformed filters, validate ranges before querying, use maximum page sizes and cursor pagination, and define stable sorting/tie-breakers.

**Tests and acceptance:** Invalid/partial dates, reversed ranges, excessive limits, negative cursors, deleted cursor targets, and stable traversal under concurrent inserts.

### F-026 Internal and health endpoints need an explicit exposure policy

**Severity:** Low  
**Classification:** Missing safeguard

**Evidence:** `backend/app/api/v1/internal.py:25-34` ships internal/debug behavior, while readiness exposes dependency state publicly in `health.py:33-48`. No deployment policy proves that operator endpoints are network-restricted.

**Required solution:** Exclude debug routes from production, expose minimal unauthenticated liveness only, protect readiness/diagnostics with network and identity controls, and inventory routes during build.

**Tests and acceptance:** Production route snapshot excludes debug handlers; unauthenticated readiness is denied or sanitized; operator access is audited.

### F-027 Existing automated checks provide a useful baseline

**Severity:** Informational  
**Classification:** Verified positive evidence

The default FastAPI suite passed 314 tests, Vitest passed 132 tests, TypeScript and scoped ESLint passed, 175 Python files parsed, and the Next.js production build passed. Preserve these checks and expand them; do not treat them as evidence that production trust boundaries are secure because many negative, concurrency, infrastructure, and migration scenarios are absent or deselected.

### F-028 Targeted dependency advisory checks did not identify the reviewed named versions as affected

**Severity:** Informational  
**Classification:** Bounded dependency observation

Next.js 16.3.4 and jsPDF 4.2.1 are beyond the affected ranges in the specifically reviewed official advisories. This is not a full transitive dependency scan, and Python deployment is not reproducible until a lockfile with hashes exists.

## 6. Required public interface changes

These are intentional contract changes. Implement backend and clients atomically.

1. Remove `userId`, `viewerId`, and `actorId` from privileged request bodies and query parameters. Resolve the actor from authenticated server context.
2. Return scoped `404` for protected objects that are nonexistent or invisible to the caller.
3. Replace free-form category/exemption strings with versioned enums and structured exemption evidence plus approval state.
4. Replace mobile URL bearer tokens with a one-time QR exchange and authorization-header session credential.
5. Add report manifest fields: artifact hash, signature status, signing key ID, actual verifier ID, record version, ruleset version, renderer version, evidence hashes, and immutable object version.
6. Add `Idempotency-Key` support for scan, retry, finalize, transition, and report-generation operations. Return durable job IDs and lease-aware states.
7. Replace offset-heavy and unbounded collections with bounded cursor pagination and stable sort keys.
8. Standardize error responses with a public code, safe message, request ID, and field errors; never return raw exception strings.
9. Generate TypeScript request/response types and clients from versioned FastAPI OpenAPI output.

## 7. Phased implementation plan

### Phase 0 Safety baseline

**Entry condition:** Current worktree and toolchain are documented. No implementation changes yet.

**Tasks**

- Record `git status`, branch, and commit; identify user-owned changes.
- Run the default Python and TypeScript gates.
- Create a dedicated feature branch only if the user requests one.
- Provision a disposable PostgreSQL integration database before migration work.
- Convert the findings assigned to the next phase into failing regression tests.

**Gate:** Baseline results are recorded and no unrelated file changes exist.

### Phase 1 Authorization and authoritative API boundary

**Findings:** F-001, F-002, relevant portions of F-017 and F-021.

**Tasks:** Implement fail-closed scoped repositories; remove caller identity; disable/replace mock route authority; align clients; add access matrix tests.

**Gate:** Anonymous, forged-ID, incomplete-profile, and cross-jurisdiction tests pass for every protected endpoint. Production build contains no privileged unauthenticated mock route.

**Rollback:** Roll back the full phase deployment. Do not re-enable fail-open behavior; repair profiles or routing instead.

### Phase 2 Evidence integrity and deployment correctness

**Findings:** F-003, F-004, F-011, F-024.

**Tasks:** Repair migration baseline; implement immutable record/report manifests; correct verifier identity; add signing/hash verification; make container rendering work; enforce audit events.

**Gate:** Fresh and existing database migration tests pass on disposable PostgreSQL; report container smoke test passes; artifact tampering fails verification; audit mutation is database-denied.

**Rollback:** Use reviewed migration downgrade/forward-fix procedures and retain versioned objects. Never overwrite or delete evidence to roll back application code.

### Phase 3 Compliance decision correctness

**Findings:** F-005, F-013, F-014, F-015.

**Tasks:** Authoritative categories/exemptions; unit-aware Unicode identity; versioned/effective-dated rules; evidence binding; multilingual OCR; AI provenance and strict structured output.

**Gate:** Legal fixtures, malicious exemption inputs, Unicode/unit identity cases, prompt injection, and changed-evidence invalidation pass. A legal-metrology reviewer approves the ruleset version.

**Rollback:** Keep prior ruleset available for historical replay but stop new evaluations if the new ruleset is withdrawn. Never reinterpret existing signed reports silently.

### Phase 4 Trust-boundary hardening

**Findings:** F-006, F-008, F-009, F-010, F-023, F-026.

**Tasks:** Streaming limits and quotas; safe image decoding; SSRF-safe egress; token exchange; strict JWT policy; safe errors/logging; route exposure policy.

**Gate:** Abuse, size, decompression, DNS rebinding, JWT substitution, token leakage, and debug-route tests pass. Resource/cost ceilings are observed under load.

**Rollback:** Roll back compatible code while retaining restrictive edge limits and token revocation. Never restore query bearer tokens.

### Phase 5 Durable processing and database integrity

**Findings:** F-007, F-008, F-011, F-016, F-021.

**Tasks:** Durable queue/outbox; idempotency, leases, and reaper; transactional object lifecycle; uniqueness constraints; versioned case and record transitions; replace process-local stores.

**Gate:** Worker-kill, duplicate-delivery, lease-expiry, concurrent transition, storage failure, process restart, and multi-replica tests pass.

**Rollback:** Pause consumers before application rollback. Preserve queued messages, outbox rows, attempts, and object versions.

### Phase 6 Scalability and operational readiness

**Findings:** F-012, F-017 through F-022, F-025, F-028.

**Tasks:** Generated contracts; SQL aggregation and cursor pagination; production config validation; observability/SLOs; hardened images and CI/CD; India-region data architecture; retention; backup/restore; incident response; correct documentation.

**Gate:** Load/query budgets, generated-contract checks, container scans/signatures, India-residency review, restore drill, canary rollback, alert drills, documentation verification, and departmental approvals complete.

## 8. Mandatory command gates

Use the repository's supported runtimes. Adjust executable paths to the local environment without changing the meaning of the checks.

```powershell
# Python syntax
python -m compileall backend/app backend/tests backend/alembic

# FastAPI unit and contract tests
Set-Location backend
python -m pytest tests/unit tests/contract -q

# Integration tests only with disposable services
$env:TEST_DATABASE_URL = '<dedicated disposable PostgreSQL URL>'
python -m pytest tests/integration -q

# Next.js contracts, lint, unit tests, and production build
Set-Location ..
pnpm exec tsc --noEmit
pnpm exec eslint src tests scripts next.config.ts vitest.config.ts eslint.config.mjs
pnpm exec vitest run
pnpm exec next build
```

Additional mandatory gates by phase:

- Migration: fresh upgrade, existing upgrade, schema diff, downgrade/upgrade rehearsal.
- Reports: production-container rendering, repeated-byte equality, signature verification, tamper/delete tests.
- Authorization: endpoint access matrix and route inventory.
- Jobs: duplicate delivery, worker crash, stale lease, and concurrency tests.
- Upload/SSRF: adversarial body, decoder, DNS, redirect, timeout, and cost-limit tests.
- Deployment: SBOM, SCA, SAST, secret scan, image scan, signature verification, canary, and rollback.

## 9. Monitoring and production acceptance

Production approval requires evidence for:

- Authorization denials by action and jurisdiction, without sensitive payloads.
- Authentication failures, throttling, JWKS health, and anomalous token use.
- Upload rejection, decoder failure, OCR/model latency, model cost, and quota usage.
- Queue depth, lease age, retries, dead letters, stale jobs, and outbox lag.
- Report generation stages, missing evidence, hash/signature failures, and public verification failures.
- Database latency, query counts, lock waits, pool saturation, migration revision, backup age, and restore verification.
- Object-storage integrity, versioning/object lock, residency, retention, and deletion failures.
- SLOs and alerts with named operational owners, escalation paths, and runbooks.

Rollback criteria must be measurable. Examples include authorization denial anomalies, report verification failure above zero for newly generated artifacts, irreconcilable migration differences, queue lease accumulation, data-integrity constraint violations, or SLO regression beyond the approved error budget.

## 10. Test-quality gaps to close

- Cross-jurisdiction negative tests are absent for most object endpoints.
- Next.js tests encode fail-open behavior and do not prove server authentication.
- Migration round-trip tests are deselected from the ordinary gate.
- Security boundaries are heavily mocked rather than exercised with real token and database behavior.
- There are no meaningful worker-crash, duplicate-delivery, concurrency, or stale-state tests.
- Report tests do not prove production-container rendering, byte immutability, object tampering, deletion, or signatures.
- Upload tests do not cover chunked oversize bodies, decoder bombs, MIME forgery, or concurrent cost abuse.
- SSRF tests do not prove connection-time peer identity under DNS rebinding.
- Legal-rule fixtures do not cover current amendments, effective dates, multilingual labels, or adversarial model output.
- Performance tests do not assert query count, high-cardinality latency, pool behavior, or deep pagination.
- No automated restore, DR, incident, or deployment rollback exercise is present.

## 11. Official references

- OWASP API Security Top 10 2023: https://api-security.owasp.org/editions/2023/en/0x11-t10/
- OWASP API1 Broken Object Level Authorization: https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/
- OWASP API4 Unrestricted Resource Consumption: https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/
- Guidelines for Indian Government Websites and Apps: https://guidelines.india.gov.in/guidelines/
- CERT-In directions under section 70B: https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
- Digital Personal Data Protection Rules 2025: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
- Department of Consumer Affairs Legal Metrology rules: https://consumeraffairs.nic.in/legalmetrologyactsandrules
- Backblaze data regions: https://www.backblaze.com/docs/cloud-storage-data-regions
- Next.js advisory GHSA-2xp9-vwfh-vxw4: https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4
- Next.js advisory GHSA-p293-qw3h-jr36: https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36
- jsPDF advisory GHSA-wfv2-pwc8-crg5: https://github.com/parallax/jsPDF/security/advisories/GHSA-wfv2-pwc8-crg5

## Appendix A Complete reviewed-file ledger

The ledger records the 312 tracked files reviewed at baseline commit `d7c3a0c4fcb6`. This newly created brief is not part of that baseline count.

Legend: `F` finding evidence, `A` reviewed without a separate material finding, `T` test or fixture reviewed, `E` empty package/placeholder, `R` reference or generated document screened.

### A.1 FastAPI source, configuration, and migrations

```text
backend/.dockerignore                                            A
backend/.env.example                                             F
backend/alembic.ini                                              A
backend/alembic/env.py                                           A
backend/alembic/script.py.mako                                   A
backend/alembic/versions/0001_mvp_schema.py                      F
backend/alembic/versions/0002_rule_explanations.py               F
backend/alembic/versions/0003_product_identifiers.py             F
backend/alembic/versions/0004_ecommerce_sourcing.py              F
backend/alembic/versions/0005_mobile_upload_sessions.py          F
backend/alembic/versions/0006_report_lifecycle.py                F
backend/app/__init__.py                                          E
backend/app/api/__init__.py                                      E
backend/app/api/deps/__init__.py                                 E
backend/app/api/deps/auth.py                                     F
backend/app/api/deps/mobile_handoff.py                           A
backend/app/api/deps/permissions.py                              F
backend/app/api/v1/__init__.py                                   E
backend/app/api/v1/auth.py                                       F
backend/app/api/v1/cases.py                                      F
backend/app/api/v1/companies.py                                  A
backend/app/api/v1/dashboard.py                                  F
backend/app/api/v1/ecommerce.py                                  F
backend/app/api/v1/explanations.py                               F
backend/app/api/v1/health.py                                     F
backend/app/api/v1/internal.py                                   F
backend/app/api/v1/mobile_handoff.py                             F
backend/app/api/v1/products.py                                   A
backend/app/api/v1/records.py                                    F
backend/app/api/v1/reports.py                                    F
backend/app/api/v1/scans.py                                      F
backend/app/core/__init__.py                                     E
backend/app/core/config.py                                       F
backend/app/core/errors.py                                       F
backend/app/core/ids.py                                          A
backend/app/core/logging.py                                      F
backend/app/core/object_storage.py                               F
backend/app/core/security.py                                     F
backend/app/db/__init__.py                                       E
backend/app/db/base.py                                           A
backend/app/db/models/__init__.py                                A
backend/app/db/models/audit_event.py                             F
backend/app/db/models/case.py                                    F
backend/app/db/models/compliance_record.py                       F
backend/app/db/models/legal_entity.py                            F
backend/app/db/models/mobile_handoff.py                          F
backend/app/db/models/product.py                                 F
backend/app/db/models/product_identifier.py                      F
backend/app/db/models/report.py                                  F
backend/app/db/models/risk_alert.py                              F
backend/app/db/models/rule_explanation.py                        A
backend/app/db/models/scan.py                                    F
backend/app/db/models/user_profile.py                            F
backend/app/db/session.py                                        A
backend/app/jobs/__init__.py                                     E
backend/app/jobs/pipeline.py                                     F
backend/app/jobs/reports.py                                      F
backend/app/main.py                                              F
backend/app/schemas/__init__.py                                  E
backend/app/schemas/auth.py                                      F
backend/app/seed/__init__.py                                     E
backend/app/seed/demo_profiles.example.json                      R
backend/app/seed/demo_profiles.py                                A
backend/app/services/__init__.py                                 E
backend/app/services/auth/__init__.py                            E
backend/app/services/auth/supabase_auth.py                       F
backend/app/services/barcode/__init__.py                         E
backend/app/services/barcode/checksum.py                         A
backend/app/services/barcode/detect.py                           A
backend/app/services/barcode/normalize.py                        A
backend/app/services/barcode/resolve.py                          A
backend/app/services/barcode/types.py                            A
backend/app/services/cases/__init__.py                           E
backend/app/services/cases/workflow.py                           F
backend/app/services/company_profile/__init__.py                 E
backend/app/services/company_profile/aggregate.py                F
backend/app/services/ecommerce/__init__.py                       E
backend/app/services/ecommerce/category.py                       F
backend/app/services/ecommerce/fetcher.py                        F
backend/app/services/ecommerce/parser.py                         A
backend/app/services/ecommerce/ssrf_guard.py                     F
backend/app/services/ecommerce/types.py                          A
backend/app/services/explanation/__init__.py                     E
backend/app/services/explanation/gemini_explainer.py             F
backend/app/services/extraction/__init__.py                      E
backend/app/services/extraction/adapter.py                        F
backend/app/services/extraction/schema.py                         A
backend/app/services/gemini_client.py                             F
backend/app/services/image_quality.py                             F
backend/app/services/intelligence_loop.py                         F
backend/app/services/measurement/__init__.py                      E
backend/app/services/measurement/font_height.py                   A
backend/app/services/mobile_handoff/__init__.py                   E
backend/app/services/mobile_handoff/service.py                    F
backend/app/services/mobile_handoff/tokens.py                     F
backend/app/services/normalization.py                             F
backend/app/services/ocr/__init__.py                              E
backend/app/services/ocr/gemini.py                                F
backend/app/services/ocr/paddle.py                                F
backend/app/services/ocr/provider.py                              A
backend/app/services/product_dna/__init__.py                      E
backend/app/services/product_dna/dna.py                           F
backend/app/services/product_dna/identity.py                      F
backend/app/services/records/__init__.py                          E
backend/app/services/records/serialize.py                         F
backend/app/services/reports/__init__.py                          E
backend/app/services/reports/images.py                            F
backend/app/services/reports/schema.py                            A
backend/app/services/reports/snapshot.py                          F
backend/app/services/risk/__init__.py                             E
backend/app/services/risk/engine.py                               A
backend/app/services/risk/persist.py                              F
backend/app/services/rules/__init__.py                            E
backend/app/services/rules/aggregate.py                           F
backend/app/services/rules/apply.py                               A
backend/app/services/rules/checks.py                              F
backend/app/services/rules/frontend_adapter.py                    F
backend/app/services/rules/rule7_thresholds.py                    A
backend/app/services/rules/types.py                               A
backend/app/services/scope.py                                     F
backend/docker-compose.yml                                        F
backend/docker/postgres-init/001-create-test-db.sql                A
backend/Dockerfile                                                 F
backend/pyproject.toml                                              F
```

### A.2 FastAPI tests and fixtures

```text
backend/tests/__init__.py                                         E
backend/tests/conftest.py                                         T
backend/tests/contract/__init__.py                                E
backend/tests/contract/fixtures/records_page_v0.json              T
backend/tests/contract/schemas_v0.py                              T
backend/tests/contract/test_records_contract.py                   T
backend/tests/integration/__init__.py                             E
backend/tests/integration/test_alembic_roundtrip.py               T
backend/tests/integration/test_auth_live.py                       T
backend/tests/integration/test_barcode_pipeline.py                T
backend/tests/integration/test_dashboard_scope.py                 T
backend/tests/integration/test_database.py                        T
backend/tests/integration/test_ecommerce_batch.py                 T
backend/tests/integration/test_ecommerce_scan_endpoint.py         T
backend/tests/integration/test_gemini_explanation.py              T
backend/tests/integration/test_intelligence_loop.py               T
backend/tests/integration/test_mobile_handoff.py                  T
backend/tests/integration/test_object_storage.py                  T
backend/tests/integration/test_phase7_evidence_and_search.py      T
backend/tests/integration/test_readiness_live.py                  T
backend/tests/integration/test_reports_immutable.py               T
backend/tests/integration/test_rule7_calibration.py               T
backend/tests/unit/__init__.py                                    E
backend/tests/unit/test_app_startup.py                            T
backend/tests/unit/test_auth_deps.py                              T
backend/tests/unit/test_barcode_checksum.py                       T
backend/tests/unit/test_barcode_normalize.py                      T
backend/tests/unit/test_barcode_resolve.py                        T
backend/tests/unit/test_case_workflow.py                          T
backend/tests/unit/test_check_rule_7.py                           T
backend/tests/unit/test_check_rule_8.py                           T
backend/tests/unit/test_check_rule_9.py                           T
backend/tests/unit/test_config.py                                 T
backend/tests/unit/test_dashboard_aggregate.py                    T
backend/tests/unit/test_ecommerce_fetcher.py                      T
backend/tests/unit/test_ecommerce_parser.py                       T
backend/tests/unit/test_ecommerce_ssrf_guard.py                   T
backend/tests/unit/test_errors.py                                 T
backend/tests/unit/test_font_measurement.py                       T
backend/tests/unit/test_frontend_adapter.py                       T
backend/tests/unit/test_gemini_client.py                          T
backend/tests/unit/test_gemini_explainer.py                       T
backend/tests/unit/test_health.py                                 T
backend/tests/unit/test_image_quality.py                          T
backend/tests/unit/test_login_endpoint.py                         T
backend/tests/unit/test_mobile_handoff_auth.py                    T
backend/tests/unit/test_mobile_handoff_tokens.py                  T
backend/tests/unit/test_normalization.py                          T
backend/tests/unit/test_object_storage.py                         T
backend/tests/unit/test_ocr_paddle.py                             T
backend/tests/unit/test_permissions.py                            T
backend/tests/unit/test_pipeline.py                               T
backend/tests/unit/test_records_endpoint.py                       T
backend/tests/unit/test_records_serialize.py                      T
backend/tests/unit/test_report_images.py                          T
backend/tests/unit/test_report_snapshot.py                        T
backend/tests/unit/test_risk_engine.py                            T
backend/tests/unit/test_rule7_thresholds.py                       T
backend/tests/unit/test_rules.py                                  T
backend/tests/unit/test_scans_endpoint.py                         T
backend/tests/unit/test_security.py                               T
```

### A.3 Next.js route handlers

```text
src/app/api/activity/route.ts                                     A
src/app/api/admin/reassign/route.ts                               F
src/app/api/admin/team/route.ts                                   F
src/app/api/admin/thresholds/route.ts                             F
src/app/api/admin/users/[id]/deactivate/route.ts                  F
src/app/api/admin/users/[id]/status/route.ts                      F
src/app/api/analytics/route.ts                                    F
src/app/api/dashboard/route.ts                                    F
src/app/api/ecommerce/batches/[batchId]/route.ts                  F
src/app/api/ecommerce/batches/route.ts                            F
src/app/api/ecommerce/scan/route.ts                               F
src/app/api/ecommerce/scrape/route.ts                             F
src/app/api/grievances/[reference]/route.ts                       F
src/app/api/grievances/route.ts                                   F
src/app/api/manufacturers/[id]/flag-enforcement/route.ts          F
src/app/api/manufacturers/[id]/scorecard/route.ts                 F
src/app/api/manufacturers/route.ts                                F
src/app/api/mobile-sessions/[token]/capture/route.ts              F
src/app/api/mobile-sessions/[token]/connect/route.ts              F
src/app/api/mobile-sessions/[token]/route.ts                      F
src/app/api/mobile-sessions/route.ts                              F
src/app/api/records/[id]/archive/route.ts                         F
src/app/api/records/[id]/corrections/route.ts                     F
src/app/api/records/[id]/flag-enforcement/route.ts                F
src/app/api/records/[id]/needs-review/route.ts                    F
src/app/api/records/[id]/retry-ocr/route.ts                       F
src/app/api/records/[id]/route.ts                                 F
src/app/api/records/[id]/verify/route.ts                          F
src/app/api/records/bulk/needs-review/route.ts                    F
src/app/api/records/route.ts                                      F
src/app/api/reports/[id]/download/[format]/route.ts               F
src/app/api/reports/[id]/route.ts                                 F
src/app/api/reports/generate/route.ts                             F
src/app/api/reports/route.ts                                      F
src/app/api/reports/runs/[runId]/retry/[stageId]/route.ts         F
src/app/api/reports/runs/[runId]/route.ts                         F
src/app/api/reports/scope/route.ts                                F
src/app/api/scan-pipelines/[scanId]/retry/[stageId]/route.ts      F
src/app/api/scan-pipelines/[scanId]/route.ts                      F
src/app/api/scan-pipelines/route.ts                               F
```

### A.4 Next.js server stores and renderers

```text
src/lib/server/admin-store.ts                                     F
src/lib/server/audit-store.ts                                     F
src/lib/server/ecommerce-store.ts                                 F
src/lib/server/grievance-store.ts                                 F
src/lib/server/mobile-session-store.ts                            F
src/lib/server/report-render-v2/docx.ts                           F
src/lib/server/report-render-v2/index.ts                          F
src/lib/server/report-render-v2/pdf.ts                            F
src/lib/server/report-render-v2/shared.ts                         F
src/lib/server/report-render.ts                                   F
src/lib/server/report-store.ts                                    F
src/lib/server/scan-pipeline-store.ts                             F
```

### A.5 API clients and shared contracts

```text
src/lib/api/.gitkeep                                              E
src/lib/api/activity.ts                                           A
src/lib/api/admin.ts                                              F
src/lib/api/analytics.ts                                          F
src/lib/api/auth.ts                                               F
src/lib/api/cases.ts                                              A
src/lib/api/client.ts                                             F
src/lib/api/companies.ts                                          A
src/lib/api/ecommerce.ts                                          F
src/lib/api/explanations.ts                                       A
src/lib/api/grievances.ts                                         F
src/lib/api/manufacturers.ts                                      F
src/lib/api/productDna.ts                                         A
src/lib/api/records.ts                                            F
src/lib/api/report-verification.ts                                F
src/lib/api/reports.ts                                            F
src/lib/api/scans.ts                                              F
src/types/admin.ts                                                F
src/types/analytics.ts                                            F
src/types/compliance.ts                                           F
src/types/grievance.ts                                            F
src/types/history.ts                                              F
src/types/index.ts                                                A
src/types/jurisdiction.ts                                         F
src/types/manufacturer.ts                                         F
src/types/report-v2.ts                                            F
src/types/report.ts                                               F
src/types/scan.ts                                                 F
src/types/user.ts                                                 F
src/types/vocabulary.ts                                           F
```

### A.6 Frontend tests

```text
tests/e2e/.gitkeep                                                E
tests/e2e/dashboard-jurisdiction.spec.ts                          T
tests/e2e/dashboard.spec.ts                                       T
tests/e2e/jurisdiction.spec.ts                                    T
tests/e2e/login.spec.ts                                           T
tests/e2e/shell.spec.ts                                           T
tests/integration/.gitkeep                                        E
tests/setup.ts                                                    T
tests/unit/.gitkeep                                               E
tests/unit/admin.test.ts                                          T
tests/unit/audit-store.test.ts                                    T
tests/unit/barcode-search.test.ts                                 T
tests/unit/dashboard.test.ts                                      T
tests/unit/ecommerce-api.test.ts                                  T
tests/unit/format.test.ts                                         T
tests/unit/jurisdiction.test.ts                                   T
tests/unit/mobile-handoff-api.test.ts                             T
tests/unit/mock-data.test.ts                                      T
tests/unit/report-render-v2.test.ts                               T
tests/unit/reports.test.ts                                        T
tests/unit/session-expiry.test.tsx                                T
tests/unit/vocabulary.test.ts                                     T
```

### A.7 Operations, scripts, and documentation

```text
.github/workflows/backend-deploy.yml                              F
README.md                                                         F
docs/12-scan-pipeline-history-hierarchy.md                        F
docs/Design.md                                                    F
docs/README.md                                                    F
docs/SIH26034.md                                                  R
docs/UX4G_BRD_Template.md                                         R
docs/_archive/ARCHIVE_NOTE.md                                     R
docs/_archive/SIH26034_9_Page_Website_Frontend_Specification.docx  R
docs/_archive/UX4G_CodeGen_Prompt_v1.md                           R
docs/internal/BACKEND_HANDOFF.md                                  F
docs/internal/SESSION_HANDOFF.md                                  R
docs/internal/updated_product_vision.txt                          R
eslint.config.mjs                                                 A
next.config.ts                                                    F
package.json                                                      F
scripts/generate-placeholders.mjs                                 A
scripts/render-report-cli.ts                                      F
scripts/sync-locales.mjs                                          A
scripts/verify-tokens.mjs                                         A
scripts/visual-qa.mjs                                             R
tsconfig.json                                                     A
vitest.config.ts                                                  A
```

## Appendix B Completion record template

Claude Code should use the following structure when reporting each completed phase. Do not replace test output with a summary when a gate fails.

```text
Phase:
Commit or working-tree state:
Findings addressed:
Files changed:
Public contract changes:
Migrations added:
Commands run and results:
Environment-dependent checks not run:
Security negative tests added:
Monitoring or runbooks added:
Rollback procedure verified:
Remaining risks:
Gate result: PASS | FAIL | BLOCKED
```
