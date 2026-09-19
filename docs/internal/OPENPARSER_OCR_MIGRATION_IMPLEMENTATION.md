# OpenParser OCR Migration — Production Implementation Specification

**System:** Digi-Pramaan  
**Audience:** Claude Code and Digi-Pramaan backend engineers  
**Status:** Implementation brief; application code has not been changed by this document  
**Date:** 2026-09-18  
**Primary contract:** [`OCR_API_OPENAPI.yaml`](../../OCR_API_OPENAPI.yaml)  
**Audited contract SHA-256:** `750d37b8455d6e8349400ef370a0d3f0f518751f95f7a0ebbc6284f9f19f98d7`  
**Related audit:** [`BACKEND_PRODUCTION_AUDIT_AND_REMEDIATION.md`](BACKEND_PRODUCTION_AUDIT_AND_REMEDIATION.md)

## 1. Instructions to Claude Code

Before changing code:

1. Read `AGENTS.md`, `.claude/CLAUDE.md`, this document, `OCR_API_OPENAPI.yaml`, and the related backend audit.
2. Inspect the current working tree. Treat every existing modified or untracked file as user-owned. Never reset, delete, overwrite, reformat, or fold unrelated changes into this work.
3. Reconcile this specification with the current repository before editing. Paths and line references describe the audited revision and may move as user-owned work continues.
4. Recompute the OpenAPI SHA-256. If it differs from the audited checksum above, stop and update the contract analysis, fixtures, and this specification before implementing runtime code.
5. Implement one phase from section 18 at a time. Stop when a gate fails. Do not continue to later phases to hide an earlier failure.
6. Never use production credentials, shared production storage, or paid live OCR calls in automated tests. Unit and integration tests must use deterministic HTTP fakes. A live smoke test must be explicit, opt-in, manually invoked, and limited to a non-sensitive fixture.
7. Never expose OpenParser keys to the browser, mobile client, URL, logs, traces, database, job payload, exception body, or analytics. The browser continues to call only Digi-Pramaan.
8. Do not assume multiple API keys increase throughput. The OpenAPI contract says admission limits are organization/tenant scoped, not key scoped.
9. Do not invent OCR options. Resolve the selected model and supported option schema from `GET /models/ocr`; reject an invalid configured profile at startup or readiness time.
10. Preserve the original evidence object and its hash. No destructive compression, recompression, or replacement is permitted.
11. Preserve the evidentiary meaning of image angle, source image, coordinates, model, options, provider job, input hash, transformations, and all OCR attempts.
12. Keep Gemini as the structuring stage. Do not replace deterministic legal-rule evaluation with either OpenParser or Gemini.
13. Do not remove PaddleOCR or its dependencies until the OpenParser path has passed shadow evaluation, controlled cutover, and rollback observation.
14. At the end of every phase, report files changed, migrations added, commands run, results, remaining risks, and the precise rollback path.
15. Treat PaddleOCR-VL text-recognition confidence as optional. Never substitute a layout-detection score, Gemini self-report, default zero, or invented value when recognition confidence is absent.
16. Implement one-upload image intake before production cutover. Browser quality analysis is advisory; FastAPI remains authoritative and OpenParser is never called for clearly unusable evidence.

## 2. Production decision

Digi-Pramaan should add OpenParser as a server-side, asynchronous OCR provider and progressively make it the primary OCR path. The intended model is `paddleocr-vl-1.6` using the provider-neutral `openparser@1` representation, with raw provider output also retained when the API makes it available.

This is **not** permission to:

- send evidence directly from the browser to OpenParser;
- remove authoritative server-side upload validation;
- rotate keys per request to evade tenant limits;
- treat a remote durable job as a durable local workflow;
- discard the original image;
- trust provider coordinates as original-image pixels without a verified transform;
- treat OCR or Gemini output as a legal conclusion;
- ship before data-processing, retention, deletion, residency, and incident obligations are approved.

### 2.1 Why this target fits the current Azure B1 deployment

The existing PaddleOCR path loads a large local inference stack, caps images at 1600 pixels, spawns a process, and has observed 70–90 second CPU inference on dense images. A B1 App Service plan has one core and 1.75 GB RAM, which is a poor production host for best-quality local PaddleOCR. Remote OCR removes that CPU/RAM pressure, but introduces network, vendor, billing, tenancy, durability, privacy, and reconciliation requirements. This specification addresses those requirements rather than treating the change as a simple HTTP request.

## 3. Audited current-state evidence

| Area | Current implementation | Migration consequence |
|---|---|---|
| Provider contract | `backend/app/services/ocr/provider.py:19-36` defines a synchronous `extract(bytes, image_id)` and an `OcrBlock` with only text, confidence, bbox, image, and provider. | Add an asynchronous job-oriented provider boundary and richer provenance without breaking persisted legacy records. |
| Local OCR | `backend/app/services/ocr/paddle.py:62-190` resizes to 1600 px, writes a temporary PNG, spawns Paddle, maps boxes back to original pixels, and returns synchronously. | OpenParser must receive the original eligible bytes. Its geometry cannot be substituted into pixel-based rules unless coordinates are mapped and validated. |
| Pipeline | `backend/app/jobs/pipeline.py` instantiates `PaddleOcrProvider`, fetches every object, runs OCR synchronously, optionally invokes Gemini fallback, and continues to structuring/rules. | Submission, polling, result persistence, normalization, and pipeline continuation must be resumable across processes and deployments. |
| Recovery | `backend/app/jobs/pipeline.py:481-496` re-runs OCR on resume because intermediate OCR artifacts are not persisted. | Persist provider jobs and immutable outputs; never rebill or create duplicate jobs merely because the local process restarted. |
| Scheduling | Scan, mobile, and e-commerce routes use FastAPI `BackgroundTasks`; comments explicitly acknowledge it is not a durable queue. | A remote durable job does not fix local orchestration. Add a database-backed lease/reconciliation worker before production cutover. |
| Evidence | `backend/app/services/extraction/schema.py:25-31` persists image angle, OCR text, bbox, provider, and confidence; `ComplianceEvidenceBundle` stores loose OCR block dictionaries. | Add optional provenance/coordinate fields compatibly and validate citations from Gemini against actual normalized elements. |
| Configuration | `backend/app/core/config.py:87-106` describes Paddle as primary and Gemini as structurer/fallback. `backend/.env.example:57-66` says the same. | Add validated OpenParser settings and update stale documentation only in the appropriate phase. |
| Dependencies | `backend/pyproject.toml` directly includes PaddleOCR/PaddlePaddle and relies on their transitive OpenCV. | Do not remove them until any OpenCV dependency is made direct and the rollback period ends. |
| Browser capture | `src/components/scan/CameraPreview.tsx:29-74` captures a browser-selected video frame through canvas and re-encodes it as JPEG at quality `0.92`, without high-resolution still-photo constraints. | Prefer original device files or feature-detected full-resolution still capture; retain canvas only as a tested fallback and never represent its bytes as an untouched camera original. |
| Desktop image intake | `src/lib/hooks/useCaptureSlots.ts:75-103` uploads an image to the quality endpoint, then `src/lib/api/scans.ts:78-94` reads the local blob URL and uploads it again during scan creation. | Replace the double upload with a scan-draft/image-intake/finalize workflow returning immutable evidence-image IDs. |
| Mobile image intake | `src/components/scan/MobileCaptureView.tsx:169-198` already combines authoritative quality evaluation and persistence in one real-mode request. | Preserve the one-upload property while aligning its response, audit, override, and evidence semantics with desktop intake. |
| Client quality | `src/lib/utils/photoQuality.ts:24-148` performs a real 96-pixel blur/darkness advisory only for the citizen grievance flow; the main officer scan does not run it. | Add a non-authoritative officer/mobile advisory using a larger downscaled sample, while retaining independent server validation. |

## 4. OpenParser contract that the implementation must honor

`OCR_API_OPENAPI.yaml` is the authoritative checked-in API contract. Generate or validate client types against it; do not rely only on examples in this document.

### 4.1 Required behavior

- Authentication is `Authorization: Bearer <key>`.
- Tenant identity is derived server-side by OpenParser. Digi-Pramaan must never send a tenant ID.
- Each parse/extract `POST` requires `Idempotency-Key`.
- Reusing the same tenant, operation, and key with the same request returns the same job/result. Reusing it with a different body returns `409`.
- Admission limits are per organization/tenant, not per key.
- Supported OCR sources are PDF, PNG, and JPEG. Arbitrary source URLs are not accepted.
- Limits are 50 MiB per file, 100 million rendered pixels per page, and 100 MiB aggregate batch input.
- `/parse/async` and `/parse/batch` create durable jobs. The provider does not silently retry, fall back, cancel, truncate, or chunk.
- Job states are `queued`, `running`, `succeeded`, `failed`, and `indeterminate`.
- `429` and `503` include `Retry-After`; obey it with bounded jitter.
- A `202 Location` may be absolute or path-absolute. Resolve it only against the configured allow-listed OpenParser origin. Reject another origin, credentials in the URL, a fragment, or a non-HTTPS URL in production.
- A batch parent may be `succeeded` even when some children failed. Every child must be inspected.
- A fresh successful parse can expose both canonical `openparser@1` and raw provider artifacts without re-running OCR.
- Unknown/cross-tenant jobs and sources deliberately return `404`.
- Billing is per successfully parsed page. A failed or indeterminate job is described as having no page charge, but operational code must never infer billing state solely from a transient HTTP failure.

### 4.2 Endpoint use

Use these endpoints:

- `GET /models/ocr`: capability discovery and quality-profile validation.
- `POST /parse/batch`: preferred admission for a scan containing multiple evidence images. One child per `EvidenceImage`.
- `POST /parse/async`: acceptable for an isolated single image or a focused retry variant.
- `GET /jobs/{id}` or the exact contract-defined job retrieval route: polling/reconciliation.
- The contract-defined parse-result route: retrieve canonical and raw artifacts after terminal success.

Do not use synchronous `/parse` in the production pipeline. It can wait for up to the deployment sync timeout and ties up an application request/worker without providing a local durability advantage.

Do not use `/extract` for the main flow unless a later approved design deliberately replaces Gemini. The selected design keeps Gemini structuring inside Digi-Pramaan.

### 4.3 Contract discrepancies that must be handled defensively

- Coordinate units can be pixel, point, inch, or normalized. Do not assume pixel units.
- Provider output does not supply Digi-Pramaan's evidence `angle`; preserve it through `client_item_id -> EvidenceImage` mapping.
- The raw-output example contains option aliases such as `image_block_ocr`/`use_ocr_for_image_block` and `chart_recognition`/`use_chart_recognition`. Send only the canonical keys actually returned as supported by `GET /models/ocr`; never send both aliases speculatively.
- Some cross-field constraints are described in prose rather than enforced by JSON Schema. Validate them locally.
- Batch terminal status is not sufficient to decide success; reconcile every child.
- No cancellation or webhook is specified. Polling and stale-job recovery are local responsibilities.
- No job deletion API is specified. Retention/deletion must be contractually settled with the provider before production.
- The canonical `Confidence` object permits a 0–1 score with a scope such as `detection` or `recognition`, but element confidence is optional. PaddleOCR-VL may expose layout-detection scores while omitting generated-text recognition confidence. Preserve scope and calibration; absence is valid data.

## 5. Target architecture

```text
Browser/mobile
  -> highest-resolution original file or still capture available
  -> local UX quality hints on a disposable downscaled sample (non-authoritative)
  -> one authenticated upload to a Digi-Pramaan scan draft
  -> authoritative security + image-quality validation
  -> PASS / PASS_WITH_WARNINGS / RECAPTURE_REQUIRED / OVERRIDDEN
  -> immutable original in private B2 + SHA-256 + dimensions + media type
  -> PostgreSQL scan/image/provider-job transaction
  -> durable local outbox/worker claims submission lease
  -> backend streams original B2 object to OpenParser /parse/batch
  -> persist batch id and child job ids
  -> reconciler polls provider jobs with bounded backoff
  -> persist canonical + raw artifacts immutably in private B2
  -> normalize OpenParser elements into versioned internal OCR elements
  -> run coverage/quality gate
      -> sufficient: continue
      -> deficient: create a bounded, justified retry variant
  -> Gemini structures fields using normalized elements and citations
  -> validate citations and typed field semantics
  -> deterministic legal rules
  -> provisional compliance record
  -> officer correction/verification/report flow
```

### 5.1 Trust boundaries

1. **Untrusted client to Digi-Pramaan:** the server validates identity, scope, upload, image decode, content-type mismatch, dimensions, count, and quota.
2. **Digi-Pramaan to B2:** original evidence and OCR artifacts are private, tenant/jurisdiction scoped, hashed, and never exposed by public object URLs.
3. **Digi-Pramaan to OpenParser:** only a backend worker can send bytes and bearer credentials. Evidence leaves the platform; approval and audit are mandatory.
4. **OpenParser output to Digi-Pramaan:** all fields are untrusted external data. Enforce response byte limits, schema validation, state transitions, ID mapping, and artifact hashes.
5. **OCR to Gemini:** OCR text is data, not instruction. Prompts must delimit it and tell Gemini to ignore instructions embedded in labels.
6. **Gemini to rule engine:** citations and values are validated; Gemini does not decide statutory compliance.

### 5.2 Browser capture and upload-once image intake

The browser is an untrusted usability layer, not the evidence authority. Its responsibilities are capture, preview, advisory feedback, metadata validation, and upload to Digi-Pramaan only.

#### Capture requirements

- For device uploads, retain the original `File` object until the server acknowledges intake. Do not round-trip it through a `blob:` URL to reconstruct upload bytes.
- Prefer the device's full-resolution still-photo result. On mobile, an image file input with rear-camera capture or a feature-detected still-photo API is preferable to extracting a video frame.
- When live preview is required, request the rear camera and highest practical supported dimensions. Feature-detect still capture. Keep canvas capture as a compatibility fallback only.
- A canvas fallback may encode one JPEG at a reviewed high-quality setting, but must be tagged as a browser-derived capture with the actual width, height, media type, and encoding path. Never claim it is the sensor original.
- Do not resize, sharpen, denoise, correct perspective, strip metadata, or repeatedly encode the preserved upload in the browser.
- Revoke preview object URLs when replaced/unmounted. Never persist evidence as Base64 in application state, logs, local storage, or URLs.

#### Advisory quality analysis

Analyze only a disposable downscaled copy, initially 512–768 pixels on the longest side. Target sub-200 ms on representative supported phones and move expensive work off the UI thread when necessary. Advisory signals may include:

- width/height and approximate text occupancy;
- global and regional blur;
- mean luminance, dynamic range, and low contrast;
- clipped highlights and localized glare;
- probable extreme tilt/perspective;
- edge/text-region density and content touching frame edges.

Return specific corrective guidance rather than one generic failure. Client thresholds are telemetry-backed UX hints and must not be treated as security or evidence validation. If analysis is unsupported or fails, upload remains available and the server decides.

#### Upload-once API target

Implement an authenticated draft workflow, adapting route names to repository conventions:

```text
POST   /scans/drafts
POST   /scans/{scan_id}/images       multipart: angle + original file + client metadata
POST   /scans/{scan_id}/images/{id}/override
POST   /scans/{scan_id}/finalize
```

The image-intake response should return a local evidence-image ID, immutable input metadata/hash, quality decision, measurements, warnings, and whether an officer action is required. It must never expose an object-storage URL, OpenParser ID, or provider credential.

An accepted replacement creates a new image/attempt and supersedes the prior active image for that angle; it does not overwrite evidence bytes or audit history. Rejected bytes should be deleted from quarantine under a documented short retention policy unless an approved evidentiary policy requires preservation; retain only non-sensitive rejection audit metadata by default.

Finalization references accepted server-side image IDs and must be idempotent. It verifies required-angle policy transactionally and creates OCR work without asking the browser to resend bytes. Align mobile handoff with the same intake service rather than maintaining different validation/storage semantics.

### 5.3 Authoritative pre-OCR quality gate

The server streams/uploads into a bounded quarantine path, validates before paid OCR admission, and makes one of four persisted decisions:

| Decision | Meaning | OCR behavior |
|---|---|---|
| `PASS` | Suitable for OCR. | Eligible for OpenParser. |
| `PASS_WITH_WARNINGS` | Usable but moderate blur, glare, skew, contrast, or cropping risk exists. | Eligible; warnings follow the evidence and may trigger targeted retry/review. |
| `RECAPTURE_REQUIRED` | Clearly unusable or unsafe: invalid decode/type, extreme blur/darkness, inadequate effective resolution, or high-confidence absence of meaningful label content. | Do not call OpenParser. Give a specific recapture instruction. |
| `OVERRIDDEN` | An authorized officer accepts a recapture-required image because recapture is impossible. | Eligible only with actor identity, reason, timestamp, measurements, warning propagation, and audit event. |

Required authoritative controls:

- magic-byte/MIME/extension consistency, safe decode, byte/pixel/decompression limits;
- SHA-256 over exact original bytes and duplicate/perceptual-near-duplicate checks across angles;
- global and regional sharpness, illumination, contrast, overexposure, and localized glare;
- extreme skew/perspective, probable curvature, text-region presence/occupancy, and edge truncation;
- versioned algorithm/threshold profile and raw measurements;
- conservative hard-block thresholds. Weak distortion/no-text heuristics produce warnings, not automatic rejection.

Quality algorithms must be calibrated on the approved English/Hindi/mixed-script packaging corpus. Static thresholds are initial hypotheses, not legal facts. Track false-recapture and false-pass rates by device/capture path without collecting unnecessary device fingerprints.

## 6. Quality-max OCR profile

### 6.1 Input policy

- Store and hash the exact original upload before any transformation.
- If the original is valid PNG/JPEG, at most 50 MiB, and at most 100 MP, send those exact bytes on the first pass.
- Reject or ask for recapture when the authoritative limits are exceeded. Do not silently compress evidence to make it fit.
- Correct only transport-level metadata where necessary; do not strip the preserved original.
- Apply EXIF orientation in a derivative only if the provider does not reliably honor it. Persist the transform matrix and derivative hash.
- PNG conversion cannot restore information already lost by JPEG. Never market conversion as a quality improvement.
- Preserve ICC/EXIF facts or explicitly record their removal from a derivative.

### 6.2 Model and options

Preferred model: `paddleocr-vl-1.6`, but the exact deployable model identifier and option support must be resolved from `GET /models/ocr`.

Create a versioned profile, for example `openparser-quality-max-v1`, with:

- `output_format = openparser@1`;
- semantic block formatting enabled if catalog-supported;
- OCR inside image blocks enabled if catalog-supported;
- chart recognition enabled if catalog-supported;
- markdown-embedded images disabled unless a reviewed consumer requires them;
- visualization disabled;
- no unrecognized options;
- exact model catalog response hash, selected option schema, option values, and profile version recorded on every job.

The OpenAPI raw example shows these likely controls, but it is not permission to assume names:

| Intent | Observed example keys | Required implementation behavior |
|---|---|---|
| OCR image blocks | `image_block_ocr`, `use_ocr_for_image_block` | Use only the catalog-canonical supported key. |
| Charts | `chart_recognition`, `use_chart_recognition` | Use only the catalog-canonical supported key. |
| Semantic formatting | `format_block_content` | Enable if the catalog supports it. |
| Embedded image payloads | `return_markdown_images` | Keep false unless explicitly needed to reduce response size/data duplication. |
| Provider visualization | `visualize` | Keep false. Digi-Pramaan renders its own evidence. |

Fail readiness when the configured model disappears or the frozen required option set becomes invalid. Do not silently fall back to a cheaper/different model.

### 6.3 Adaptive second pass

Do not process every image multiple times. First evaluate field and angle coverage. A second pass is allowed only when a recorded quality reason exists, for example:

- no meaningful text or abnormally low element count;
- required fields for that angle are absent;
- essential text is truncated or has low usable confidence;
- orientation/reading order is clearly wrong;
- a targeted MRP, net quantity, date, country, manufacturer, or consumer-care region needs a higher-resolution crop.

Allowed variants are bounded and versioned:

- EXIF/orientation-normalized full image;
- perspective-corrected derivative with recorded homography;
- contrast/illumination-normalized derivative;
- targeted crop retaining original coordinate transform.

Each variant has its own object key, SHA-256, media type, dimensions, transform manifest, attempt number, reason code, and idempotency key. Never overwrite the first pass or original.

Maximum policy should be configurable, initially one full-image retry plus a small bounded number of targeted crops. Enforce per-scan page/cost and retry budgets.

### 6.4 Confidence semantics

PaddleOCR-VL is a generative vision-language parsing pipeline. It must not be assumed to return a meaningful per-text recognition probability. Its raw result may contain layout detector scores while parsed/generated text blocks have no recognition score. The OpenParser canonical schema permits an optional `confidence` object; it does not require one on `TextElement` or other elements.

Represent provider confidence as structured, optional metadata:

```python
class OcrConfidence(BaseModel):
    score: float  # validated 0..1 canonical score
    scope: Literal[
        "detection", "recognition", "classification",
        "geometry", "answer", "quality",
    ]
    calibrated: bool = False
    source_value: float | None = None
    source_scale: Literal[
        "zero_to_one", "zero_to_hundred", "log_probability", "unknown"
    ] | None = None
```

For backward compatibility, existing persisted numeric `OcrBlock.confidence` values must continue to deserialize. Migrate the runtime contract either by making the numeric field nullable and adding scope/calibration/source fields, or by adding a versioned `OcrElement` with a compatibility adapter. Do not silently rewrite historical values.

Rules:

- missing confidence stays `None`;
- never substitute `0`, `1`, `100`, Gemini self-confidence, or image-quality score;
- never relabel `scope=detection` as recognition confidence;
- never average scores with different scopes/providers/scales;
- preserve `calibrated`; `calibrated=false` is not a probability of correctness;
- do not block a valid element merely because confidence is absent;
- use image quality, required-field coverage, deterministic syntax/semantic validation, cross-angle/attempt agreement, and human review to assess reliability.

Persist a derived field-level assessment separately from provider confidence. It must identify its component signals and algorithm version and must not be named “OCR confidence.”

Primary references for this decision:

- `OCR_API_OPENAPI.yaml` `Confidence` schema and optional element confidence fields are the integration contract.
- [Official PaddleOCR-VL pipeline documentation](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PaddleOCR-VL.en.md) shows layout detector `score` values separately from parsed content.
- [PaddleOCR issue #16899](https://github.com/PaddlePaddle/PaddleOCR/issues/16899) records the Paddle maintainer guidance that VLM text parsing does not provide dependable confidence and recommends a different OCR pipeline when such scores are mandatory.

## 7. Provider key and tenancy design

### 7.1 Storage and access

- Store secrets in Azure Key Vault with managed identity where available; environment injection is an acceptable transitional mechanism.
- Configuration contains secret references/values only in process memory. Persist only non-secret aliases such as `primary-a` and a provider tenant/account alias.
- HTTP logging must redact `Authorization`, multipart bodies, signed URLs, OCR text, and raw provider bodies.
- Errors exposed to clients use local correlation IDs, never keys or provider bodies.

### 7.2 Multiple keys

Use one active primary key and a separately configured standby key for the same approved tenant only if the provider confirms safe failover. Keep other keys inactive by default.

Do not round-robin keys to increase throughput. The contract states quotas are tenant scoped. Keys from different tenants fragment idempotency, job visibility, billing, retention, access control, and deletion. Do not automatically fail over across tenants.

If multiple provider tenants are ever approved, treat each as a separate provider account with explicit routing and data-processing approval. Pin a job permanently to its tenant/key alias for admission and all reconciliation calls.

### 7.3 Failure policy

| Condition | Action |
|---|---|
| Transport timeout before a definitive admission response | Retry with the same tenant, same request digest, and same idempotency key. |
| `202` | Persist provider ID/Location and reconcile asynchronously. |
| `409 idempotency_conflict` | Mark local submission blocked, alert, and investigate request canonicalization; never generate a new key automatically. |
| `402` | Stop new admissions for that account, surface provider-capacity failure, alert billing owner. |
| `401`/`403` | Open circuit for the credential, do not cycle through unrelated tenants, alert. |
| `429` | Honor `Retry-After`, apply jitter, retain the same idempotency key. |
| `503` admission dependency failure | Honor `Retry-After`, replay with same idempotency key. |
| `422` | Permanent configuration/input failure unless a deliberately new input variant is created. |
| Provider `failed` | Terminal attempt; apply explicit retry policy only with a new attempt record. |
| Provider `indeterminate` | Freeze automatic resubmission, alert/reconcile billing and provider state. Human or policy resolution is required. |

## 8. Local persistence model

Create a migration and SQLAlchemy model for a table such as `ocr_provider_jobs`. Follow existing UUID/time conventions and use enums/check constraints consistent with the repository.

Required fields:

- local UUID primary key;
- `scan_session_id` and `evidence_image_id` foreign keys;
- image angle copied for immutable provenance;
- provider (`openparser` or `local_paddle`), provider tenant alias, key alias;
- provider batch ID, child job ID, and `client_item_id`;
- local state and last provider state;
- operation (`parse_batch_child`, `parse_single`, or local legacy);
- deterministic idempotency key and canonical request digest;
- model identifier, output format, option snapshot JSON, profile version, catalog snapshot hash;
- original input object key, SHA-256, byte count, dimensions, and media type;
- derivative object key/hash and transform manifest where applicable;
- attempt number, retry reason, parent attempt ID;
- submission lease owner/expiry and reconciliation lease owner/expiry;
- provider-created/started/completed timestamps and local timestamps;
- next poll time, poll count, last HTTP status, sanitized error code/message;
- canonical result object key/hash/byte count;
- raw result object key/hash/byte count;
- normalization adapter version and normalized artifact object key/hash;
- provider page count and cost/usage metadata when returned;
- created/updated timestamps.

Required constraints/indexes:

- unique `(provider, provider_tenant_alias, operation, idempotency_key)`;
- unique non-null `(provider, provider_tenant_alias, provider_job_id)`;
- unique `(evidence_image_id, profile_version, input_sha256, attempt_number)`;
- index on `(local_state, next_poll_at)`;
- index on `(scan_session_id, evidence_image_id)`;
- check attempt/page/poll counts and byte sizes are non-negative;
- check successful normalized records have immutable artifact keys and hashes;
- prevent state regression through repository/service rules and concurrency tests.

Add an outbox/work item table if the project does not already have an adequate durable work abstraction. The transaction that creates a scan/job intent must also create the work item. Workers claim rows with database locking (`FOR UPDATE SKIP LOCKED` where supported), leases, heartbeats, bounded retries, and stale-lease recovery.

### 8.1 State machine

Suggested local states:

```text
pending_submission -> submitting -> submitted -> queued -> running
                                                -> succeeded -> artifacts_stored -> normalized
                                                -> failed
                                                -> indeterminate

submitting --stale lease--> pending_submission (same idempotency key)
submitted/queued/running --poll--> provider state
```

Only `normalized`, `failed`, and policy-resolved `indeterminate` are locally terminal. `succeeded` is not complete until required artifacts are hashed and stored.

Every transition must be compare-and-set/optimistically locked or row-locked. Duplicate workers must be harmless.

## 9. Deterministic idempotency

Derive idempotency from canonical immutable inputs, not random UUIDs. One recommended shape is an HMAC-SHA256 (with a separate non-provider secret) over:

```text
digipramaan|openparser|parse|v1|scan=<uuid>|image=<uuid>|input=<sha256>|
model=<id>|profile=<version>|request=<canonical-request-sha256>|attempt=<n>
```

Encode a provider-compliant prefix plus a safe digest. Never include PII, filenames, OCR text, or secret material in the visible key.

- Network/admission replay uses the same attempt and same key.
- A materially different input/options/profile is a different request and therefore a new attempt/key.
- A provider terminal failure retry is a new attempt linked to the prior attempt, never a mutation of history.
- Persist the canonical request JSON digest before sending any bytes.

## 10. HTTP client requirements

Implement a dedicated async client, not ad hoc `httpx` calls inside pipeline code.

Required controls:

- one configured HTTPS origin in production;
- connect, write, read, and pool timeouts separately configured;
- streamed upload from private object storage or bounded spooled file; never unbounded in-memory buffering;
- response body maximums and streamed artifact downloads;
- strict Pydantic models generated/verified from the OpenAPI document;
- connection pooling, TLS verification, no automatic cross-origin auth redirects;
- allow-listed resolution of `Location`;
- `Retry-After` parser supporting the contract's seconds form and defensively supporting HTTP dates;
- bounded exponential backoff with jitter;
- circuit breaker by provider tenant/account for authentication, billing, and systemic availability failures;
- sanitized structured telemetry;
- no response-body logging;
- stable user agent and request/correlation headers that contain no PII;
- injectable clock, sleeper, transport, and random jitter for deterministic tests.

Model catalog retrieval should use a short-lived cache with a stored last-known snapshot for diagnosis. Readiness must distinguish provider unavailable from configured profile invalid. Decide with operations whether provider reachability is a readiness requirement; do not create an App Service restart loop during a provider outage.

## 11. Batch admission and reconciliation

Use one `/parse/batch` request per scan when the aggregate is within 100 MiB. Each item:

- maps `client_item_id` to the immutable local `EvidenceImage.id` (or an opaque deterministic encoding of it);
- records angle locally;
- uses the same frozen quality profile;
- retains its own input hash and attempt identity.

If the aggregate exceeds 100 MiB, partition deterministically into ordered batches while preserving per-image mapping. Never change grouping during a replay of the same attempt.

On acceptance, transactionally persist parent and child provider IDs. If the response is lost, replay the identical request with the identical idempotency key.

Poll only due jobs. Add jitter and cap poll frequency. Stop polling terminal children. A parent `succeeded` is not enough: all children must be evaluated, and pipeline continuation follows an explicit scan policy such as:

- all required angles normalized: continue;
- optional angle failed: continue only if documented coverage policy permits and record a warning;
- any required angle failed: retry or fail text extraction;
- any indeterminate child: pause and alert.

No request handler should poll until completion.

## 12. Immutable result storage and normalization

### 12.1 Artifacts

For every successful provider job:

1. Fetch canonical `openparser@1` output.
2. Fetch raw provider output when available without a second OCR charge.
3. Enforce maximum bytes, validate content type/schema, hash the exact bytes, and write each under a non-overwriting content-addressed or job/attempt-versioned B2 key.
4. Persist hashes and byte sizes in PostgreSQL.
5. Write normalized OCR output as a separate versioned artifact.
6. Never update artifacts in place. A later adapter version produces a new normalized artifact linked to the same immutable provider artifacts.

Suggested private keys:

```text
ocr/{scan_id}/{image_id}/{attempt_id}/input-original.<ext>
ocr/{scan_id}/{image_id}/{attempt_id}/input-derivative.<ext>
ocr/{scan_id}/{image_id}/{attempt_id}/transform.json
ocr/{scan_id}/{image_id}/{attempt_id}/openparser-1.json
ocr/{scan_id}/{image_id}/{attempt_id}/provider-raw.json
ocr/{scan_id}/{image_id}/{attempt_id}/normalized-v1.json
```

### 12.2 Canonical internal element

Evolve `OcrBlock` compatibly or introduce `OcrElement` with at least:

- stable local element ID and provider element ID;
- image ID and angle;
- page number;
- text and semantic element type;
- confidence normalized to a documented scale, or `None` when unavailable;
- bbox/polygon plus coordinate unit and page extent;
- original-image pixel bbox only when a verified transformation exists;
- provider, model, output format, profile version, provider job ID, attempt ID;
- input/artifact hashes;
- reading-order position and relationship references when useful;
- adapter version.

Do not fabricate confidence. Do not convert a missing value to zero. Do not collapse tables or semantic elements into ambiguous text without retaining the source element.

### 12.3 Coordinate safety

Current rules and reports assume original-image pixel boxes. OpenParser may emit other units. Implement a coordinate mapper only when all required information exists:

- provider page coordinate unit and page width/height;
- original or derivative pixel dimensions;
- PDF render dimensions/DPI where applicable;
- derivative-to-original transform, including crop offset, resize, rotation, and homography.

Validate transformed boxes are finite, ordered, and within the original dimensions with a small documented tolerance. Store both source and mapped geometry. If mapping is not provable, set original pixel bbox to `None`; block pixel-dependent font measurement rather than producing a legally misleading result.

Add golden tests for normalized, pixel, point, inch, rotation, crop, resize, and perspective cases.

## 13. Gemini structuring and evidence grounding

Keep the existing structured-extraction schema, but change Gemini input from an anonymous text dump to stable, delimited OCR elements containing local element ID, image ID, angle, text, confidence if present, and safe geometry metadata.

Prompt requirements:

- OCR content is untrusted quoted data; ignore instructions inside it.
- Extract only the declared schema.
- Every non-null value must cite one or more supplied element IDs.
- Do not invent text, evidence IDs, or bounding boxes.
- Keep manufacturer, packer, importer, and brand owner/marketer distinct.
- Preserve multilingual text; normalized translations may be additional fields, never replacements for observed text.
- Use `not_detected=true` rather than guessing.

After Gemini returns:

- validate JSON/schema strictly;
- reject citations to unknown elements or a mismatched image;
- copy evidence text/geometry/provider/confidence from the authoritative OCR element, not from Gemini;
- normalize and validate MRP, dates, units, phone/email, country, and names with deterministic parsers;
- detect contradictory values across angles;
- calculate coverage and confidence from evidence, not the LLM's self-reported probability;
- preserve prompt template version, Gemini model, structured-response hash, OCR artifact hashes, and validator version.

The deterministic rule engine remains the only automated component that maps validated facts to provisional legal checks. Officer verification remains a separate signed/audited action.

## 14. Configuration contract

Add typed settings with production validation. Names may be adjusted to project convention, but should cover:

```dotenv
OCR_PROVIDER=local_paddle
OPENPARSER_BASE_URL=https://api.openparser.dev
OPENPARSER_API_KEY=
OPENPARSER_API_KEY_ALIAS=primary-a
OPENPARSER_TENANT_ALIAS=approved-tenant-a
OPENPARSER_OCR_MODEL=paddleocr-vl-1.6
OPENPARSER_QUALITY_PROFILE=openparser-quality-max-v1
OPENPARSER_CONNECT_TIMEOUT_SECONDS=10
OPENPARSER_WRITE_TIMEOUT_SECONDS=120
OPENPARSER_READ_TIMEOUT_SECONDS=30
OPENPARSER_POOL_TIMEOUT_SECONDS=10
OPENPARSER_MAX_RESPONSE_BYTES=52428800
OPENPARSER_POLL_MIN_SECONDS=2
OPENPARSER_POLL_MAX_SECONDS=60
OPENPARSER_JOB_MAX_AGE_SECONDS=3600
OPENPARSER_SUBMISSION_MAX_ATTEMPTS=8
OPENPARSER_MAX_FULL_IMAGE_RETRIES=1
OPENPARSER_MAX_TARGETED_CROPS=3
OPENPARSER_SCAN_PAGE_BUDGET=20
OPENPARSER_SCAN_COST_USD_BUDGET=0.05
OPENPARSER_LIVE_TESTS=false
```

Provider modes:

- `local_paddle`: unchanged production behavior and rollback mode;
- `openparser_shadow`: local path remains authoritative; OpenParser runs within a bounded sampling/budget policy and is compared but cannot alter records;
- `openparser`: OpenParser is authoritative; local Paddle may remain an operator-triggered rollback, not a silent fallback;
- optionally `disabled` for maintenance, failing new OCR work clearly.

Do not comma-separate and automatically cycle API keys as the existing Gemini client does. OpenParser account routing has different tenancy/idempotency semantics.

Validate in production:

- base URL is HTTPS and contains no userinfo/query/fragment;
- key and aliases are present for OpenParser modes;
- budgets, timeouts, response caps, polling bounds, and retry counts are positive and coherent;
- selected model/profile is supported by the catalog;
- shadow sampling cannot exceed its cost budget.

## 15. Security, privacy, and procurement gate

No production evidence may be sent until the product owner/security/legal team records answers to:

- provider legal entity, subprocessors, hosting regions, and exact processing region;
- India data-residency requirements and approved cross-border transfer basis;
- whether inputs/outputs are used for model training or service improvement (must be disabled/contractually prohibited for evidence);
- encryption in transit and at rest;
- default and maximum retention for source, canonical, raw, logs, backups, and billing records;
- deletion SLA and mechanism, particularly because this API version exposes no job delete endpoint;
- tenant isolation, support access, audit logging, incident notification, breach cooperation, and vulnerability management;
- availability/SLA, queue limits, concurrency caps, rate limits, disaster recovery, and change notification;
- DPA, confidentiality, government-data suitability, and exit/export procedure;
- evidence chain-of-custody implications and admissibility review;
- spending caps, billing dispute path, and authoritative usage export.

Until approved, the implementation may be developed and tested only with synthetic/non-sensitive fixtures.

## 16. Observability and operations

Emit metrics without label-cardinality or PII leaks:

- admissions, replays, conflicts, and admission latency;
- jobs by local/provider state and age;
- queue delay, provider duration, result-fetch duration, normalization duration;
- 401/402/403/409/422/429/503 counts by tenant alias;
- retry counts and `Retry-After` delay;
- pages and estimated/returned cost by environment/provider/model/profile;
- canonical/raw/normalized artifact failures;
- required-angle completion and adaptive retry reasons;
- OCR element count, usable-confidence distribution, field coverage, citation validation failures;
- shadow disagreement/field accuracy metrics;
- stale leases, reconciliation lag, and indeterminate jobs.

Logs may include local scan/job/image IDs, provider job ID, non-secret aliases, state, status code, timings, sizes, hashes (where policy permits), and sanitized error code. Logs must not include bearer tokens, object credentials, multipart content, OCR text, extracted PII, raw response, or presigned URLs.

Alerts:

- any indeterminate job;
- sustained authentication/billing failure;
- queue/job age above SLO;
- stale lease accumulation;
- provider error/429 rate above threshold;
- daily cost/page budget anomaly;
- shadow quality regression;
- artifact hash/storage failure;
- no successful reconciliation heartbeat.

Provide runbooks for provider outage, quota exhaustion, billing suspension, leaked key, indeterminate work, schema/catalog change, rollback to local Paddle, and data-subject/evidence deletion requests.

## 17. Tests required

### 17.1 Unit and contract tests

- OpenAPI document parses and all local `$ref` values resolve.
- Client request/response fixtures validate against checked-in schemas.
- Canonical fixtures cover recognition confidence present, confidence absent, layout-detection score only, each declared confidence scope, `calibrated=false`, and unknown source scale.
- Catalog/profile resolution accepts supported keys and rejects missing model/unknown options.
- Idempotency is deterministic and changes only when material canonical inputs change.
- Key/header redaction and exception sanitization.
- All HTTP status behavior in section 7.3.
- `Location` allow-list and cross-origin rejection.
- `Retry-After`, timeout, replay, backoff, jitter, and circuit behavior with an injected clock.
- Batch mapping, deterministic partitioning, and mixed child outcomes.
- State-machine legal/illegal transitions and stale leases.
- Canonical/raw artifact hashing and no-overwrite behavior.
- Coordinate transforms and invalid geometry.
- Adapter support for text/table/figure/unknown nodes, missing confidence, multilingual text, reading order, and schema additions.
- Confidence adapters never fabricate values, conflate scopes, or interpret uncalibrated scores as probabilities; legacy numeric confidence still deserializes.
- Gemini prompt-injection fixtures and forged/unknown citation rejection.
- Second-pass budget and reason enforcement.
- configuration validation and secret-free serialization.

Use `respx` or an injected `httpx.MockTransport`; do not make paid calls.

### 17.2 Browser capture and image-intake tests

- Existing-file upload sends the original `File` once and preserves byte hash, name, type, and size.
- Full-resolution still capture is preferred when available; canvas fallback is feature-tested, tagged, and never encoded more than once.
- Camera constraints degrade safely on browsers without advanced capabilities.
- Preview object URLs are revoked; Base64 evidence does not enter persistent client state or logs.
- Advisory blur/darkness/contrast/glare/framing tests run on a disposable copy and never mutate the upload.
- Advisory failure or unsupported browser does not bypass the authoritative server decision.
- Intake verifies signature/MIME/decode/limits and returns specific decisions without leaking storage/provider details.
- Each file is uploaded once; finalization references evidence IDs and sends no image bytes.
- Finalize is idempotent and rejects missing, unauthorized, or superseded required-angle images.
- Replacements append/supersede rather than overwrite; rejected quarantine cleanup follows retention policy.
- Override requires authorized actor, reason, audit event, and warning propagation.
- Desktop, live-camera, and mobile-handoff paths share the same backend intake/quality service.
- Concurrency tests cover two uploads for one angle and upload/finalize races.

### 17.3 Database/concurrency tests

- migrations upgrade and downgrade on an isolated database;
- two workers cannot create two provider admissions for one attempt;
- crash after local intent but before admission recovers with the same key;
- crash after provider acceptance but before response persistence replays safely;
- crash after success but before artifact persistence resumes retrieval;
- duplicate pollers do not regress or duplicate state;
- stale leases are reclaimed;
- retry creates linked immutable history;
- cross-jurisdiction users cannot read job/artifact metadata;
- deletion/retention workflow covers every local artifact while preserving legally required audit facts.

### 17.4 Golden quality evaluation

Create a versioned, privacy-safe corpus containing:

- English and Hindi labels, mixed scripts, small fonts, glossy/curved packaging;
- blur, glare, perspective, rotation, shadows, low contrast, and partial occlusion;
- all required product angles;
- MRP, units, dates, manufacturer/packer/importer, country, and consumer care;
- adversarial label text resembling model instructions;
- barcodes and charts so OCR does not break barcode behavior;
- negative/missing-field cases.

Ground truth must be human-reviewed. Compare exact/normalized character accuracy, required-field precision/recall, evidence citation validity, per-angle coverage, latency percentiles, retry rate, and cost per completed scan. Do not use “number of blocks” alone as quality.

For capture/quality evaluation also report browser-advisory latency, server quality latency, false-recapture rate, false-pass rate, override rate, duplicate-upload count, image dimensions/bytes by capture path, and downstream OCR quality by quality decision. Threshold tuning must be based on this corpus, not a single device.

### 17.5 Commands

Run from repository root unless noted:

```powershell
cd backend
python -m compileall app tests
pytest -q
pytest -q -m integration
alembic upgrade head
alembic downgrade -1
alembic upgrade head

cd ..
npm run typecheck
npm run lint
npm test
npm run build
```

Integration tests require isolated test Postgres/B2, never production. If infrastructure is unavailable, report the block; do not claim a pass.

An optional live provider smoke test must require all of:

```text
OPENPARSER_LIVE_TESTS=true
APP_ENV=test
an explicit test tenant/key
a synthetic fixture allow-list
a hard one-page and cost cap
```

It must be excluded from normal `pytest` runs and CI forks.

## 18. Phased implementation plan

### Phase 0 — Contract, fixtures, design reconciliation

**Entry:** no application changes yet.  
**Tasks:** parse the OpenAPI contract in tests; record exact request/result/job schemas; inspect current migration head and dirty changes; add sanitized canonical/raw/job fixtures including missing and scoped confidence; inventory all browser/device/mobile capture and image-intake paths; create an ADR documenting decisions and unresolved provider/compliance questions; define quality evaluation corpus and metrics.  
**Gate:** fixtures validate against the OpenAPI; no live call; architecture review accepts provider boundary, nullable/scoped confidence, upload-once intake, quality decisions, schema, idempotency, and tenancy design.  
**Rollback:** documentation/tests only.

### Phase 1 — Capture, upload-once intake, and authoritative quality

**Entry:** Phase 0 accepted.  
**Tasks:** preserve original `File` objects; prefer full-resolution still capture and improve the canvas fallback; add advisory downscaled checks; implement scan draft, one-upload image intake, shared authoritative quality service, append/supersede replacement, override audit, and idempotent finalize. Do not call OpenParser. Keep existing APIs temporarily behind compatibility adapters where required.  
**Gate:** capture/intake test matrix passes; byte hashes prove no mutation; one network upload per accepted image; severe unusable images never reach an OCR work state; existing mobile/desktop workflows remain compatible.  
**Rollback:** retain compatibility route behavior behind a feature flag; disable advisory checks; do not destroy newly stored evidence/audit history.

### Phase 2 — Configuration and HTTP client

**Entry:** Phase 1 accepted.  
**Tasks:** add typed/redacted settings; implement catalog, submit, poll, and result client; implement error taxonomy, timeouts, allow-listed Location, Retry-After, and deterministic fakes. Do not wire scans yet.  
**Gate:** full unit suite plus exhaustive mocked status/secret-leak tests.  
**Rollback:** no runtime selection; remove unused client/config changes.

### Phase 3 — Persistence, outbox, and worker

**Entry:** client stable.  
**Tasks:** add provider-job/work migrations and models; repositories; leases; outbox submission and reconciliation loop; immutable artifact writer. Keep Paddle authoritative.  
**Gate:** migration round trip; concurrency/crash matrix; no duplicate admission in fault injection.  
**Rollback:** stop worker; leave additive tables intact or downgrade only in controlled environments.

### Phase 4 — Normalization, optional confidence, and evidence geometry

**Entry:** successful artifacts can be persisted.  
**Tasks:** implement versioned OpenParser adapter; optional scoped/calibrated confidence; legacy numeric-confidence compatibility; coordinate unit/transform handling; richer provenance; backward-compatible evidence serialization; golden fixtures.  
**Gate:** adapter/confidence/coordinate golden tests; old records still deserialize; layout scores never become recognition scores; pixel-dependent rules refuse unverified geometry.  
**Rollback:** retain raw/canonical artifacts and disable new adapter version.

### Phase 5 — Pipeline orchestration

**Entry:** durable job lifecycle works.  
**Tasks:** add provider modes; make scan text-extraction stage wait/resume from normalized artifacts; remove request-bound polling; make retries idempotent; implement required-angle/mixed-child policy. Do not remove Paddle.  
**Gate:** end-to-end mocked pipeline survives process restarts at every boundary and produces one record. Existing endpoint contracts remain compatible.  
**Rollback:** set `OCR_PROVIDER=local_paddle`; workers may finish/reconcile already admitted jobs without altering records.

### Phase 6 — Gemini grounding and adaptive quality

**Entry:** normalized elements stable.  
**Tasks:** cite element IDs; validate returned citations; add deterministic field validation; implement coverage gate and bounded retry variants; persist prompt/model/validator provenance. Derive field reliability from explicit signals, never by inventing OCR confidence.  
**Gate:** adversarial/multilingual/missing-confidence fixtures; no forged evidence accepted; budgets enforced; rule engine remains deterministic.  
**Rollback:** disable adaptive retries; keep first-pass normalized OCR; switch provider mode if required.

### Phase 7 — Shadow evaluation

**Entry:** compliance approval for the exact non-production/shadow dataset and provider account.  
**Tasks:** run OpenParser on a budgeted sample while Paddle remains authoritative; build comparison reports; measure field quality, citations, missing-confidence frequency, latency, failures, and cost. Do not expose shadow results to officers as authoritative.  
**Gate:** pre-agreed thresholds in section 19 achieved across the full golden corpus and a representative approved sample; no unresolved high-severity privacy/security issue.  
**Rollback:** disable shadow admissions; retain approved audit artifacts per policy.

### Phase 8 — Controlled production cutover

**Entry:** Phase 7 and legal/security/procurement gate approved.  
**Tasks:** canary by explicit jurisdiction/user cohort; monitor; progressively increase; maintain local rollback and drain/reconcile semantics; train operators and publish runbooks.  
**Gate:** SLO, quality, cost, and error thresholds stable for the observation window; restore drill succeeds.  
**Rollback:** route new scans to local Paddle, continue reconciling paid admitted OpenParser jobs, prevent duplicate records, and preserve all evidence.

### Phase 9 — Dependency/container cleanup

**Entry:** cutover stable for the approved retention period and rollback decision signed off.  
**Tasks:** make OpenCV/Pillow dependencies explicit if still used by authoritative quality checks; remove Paddle code/packages/models only if local rollback is formally retired; shrink and rescan image; update docs and capacity plan.  
**Gate:** clean container build, vulnerability/license scan, full test/build, cold-start and memory checks, rollback strategy updated to a deployable prior image.  
**Rollback:** redeploy the last signed image containing local Paddle.

## 19. Acceptance criteria

Finalize numerical thresholds with the product/legal-metrology owner before shadow evaluation. Minimum technical criteria:

- zero browser/mobile exposure of provider credentials;
- one upload per accepted evidence image and zero image-byte resend during finalize;
- uploaded existing-file SHA-256 matches the browser-selected original bytes; browser-derived captures are explicitly identified;
- 100% authoritative quality decisions carry profile version and raw measurements; overrides carry actor, reason, time, warning, and audit event;
- zero duplicate provider jobs/charges across all injected crash points;
- 100% successful mapping from provider child to local image and angle;
- 100% immutable input/canonical/raw/normalized hashes for successful attempts;
- zero accepted Gemini citations to absent elements;
- zero fabricated confidence values and zero detection-to-recognition score relabeling;
- zero use of unverified provider geometry in pixel/mm legal measurement;
- 100% required-angle terminal accounting; no batch-child failure hidden by parent success;
- successful restart recovery without manual database editing;
- hard page/retry/cost budget enforcement;
- every log/trace test is free of token, OCR body, sensitive extracted text, and signed URL leakage;
- migration upgrade/downgrade verified on an isolated database;
- full Python and TypeScript suites/build pass;
- operational alerts and rollback drill demonstrated;
- provider DPA/residency/retention/deletion gate signed off.

Suggested initial performance/quality targets for review, not automatic facts:

- required-field recall and precision no worse than the approved baseline and materially better on Hindi/mixed-script/small-text sets;
- citation validity 100%;
- p95 first-pass OCR completion within the product SLO under contracted concurrency;
- terminal provider failure below the agreed SLO;
- adaptive retry rate low enough to stay within the per-scan cost budget;
- no unexplained cost/page discrepancy.

## 20. Likely file impact map

Claude must confirm exact names before editing. Expected areas:

- `backend/app/core/config.py`, `backend/.env.example`;
- `src/components/scan/CameraPreview.tsx`, `src/lib/hooks/useCaptureSlots.ts`, `src/lib/api/scans.ts`, mobile capture code, and related client tests;
- scan/image intake routes and schemas, shared authoritative quality service, storage quarantine/finalization helpers, and audit events;
- `backend/app/services/ocr/provider.py`;
- new `backend/app/services/ocr/openparser/` client, contracts, adapter, profile, and error modules;
- `backend/app/jobs/pipeline.py` and a durable worker/reconciler module;
- `backend/app/db/models/` and new Alembic migration(s), based on the actual current head;
- `backend/app/services/extraction/schema.py`, Gemini structuring/prompt/adapter code;
- object-storage helper(s) for immutable artifacts and streaming;
- health/readiness and structured logging/metrics modules;
- targeted unit/integration/contract/golden tests;
- container/dependency/workflow/docs only in their corresponding phases.

Frontend contracts may change for the upload-once scan-draft/image-intake workflow, but must remain versioned or compatibility-wrapped during rollout. The browser should never learn object-storage credentials/keys, provider job IDs, or OpenParser credentials.

## 21. Definition of done

The migration is done only when:

- the OpenParser path is durable, idempotent, restart-safe, contract-tested, and observable;
- best-quality supported options are catalog-validated and recorded per attempt;
- capture preserves original device files where available, image bytes upload once, and server quality decisions precede paid OCR;
- missing PaddleOCR-VL recognition confidence is represented honestly and never replaced or conflated with layout/Gemini/quality scores;
- originals and all provider/normalized artifacts are immutable and hash-linked;
- evidence geometry and citations remain legally defensible;
- all required tests, builds, migrations, fault injections, and rollback drills pass;
- security/privacy/procurement gates are recorded;
- controlled cutover meets approved quality, latency, reliability, and cost thresholds;
- stale Paddle documentation/dependencies are removed only after rollback retirement;
- no unrelated user-owned worktree changes were modified.

## 22. Mandatory questions for OpenParser before production

Claude cannot answer these from the OpenAPI file. Record vendor answers in an ADR/risk register:

1. Are the 10+ keys in one tenant or distinct tenants, and what are exact rate/concurrency limits?
2. Which region processes and stores source and result data? Can India-only processing be guaranteed?
3. What are input/result/log/backup retention and deletion mechanisms/SLA?
4. Are customer documents or outputs ever used for training or human review?
5. Can the account enforce spend/page/concurrency caps?
6. What is the durable job retention window and maximum queue age?
7. How are API/model/schema changes versioned and announced?
8. Which `paddleocr-vl-1.6` options are currently canonical and supported?
9. What coordinate units are returned for PNG/JPEG and how are EXIF orientation and page dimensions represented?
10. Is raw output guaranteed for this model, and for how long can canonical/raw artifacts be retrieved?
11. How are indeterminate admission/billing disputes resolved?
12. What support/SLA/security/DPA/subprocessor terms apply to government evidence?
