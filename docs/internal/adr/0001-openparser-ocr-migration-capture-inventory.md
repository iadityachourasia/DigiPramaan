# ADR 0001 Appendix: Frontend Capture / Image-Intake Inventory

**Companion to:** `0001-openparser-ocr-migration.md`. Read that file for the decisions; this file is the citation-dense evidence behind §4 ("Upload-once intake decision") and §5 ("Four-state quality-decision model") of that ADR — organized for repeated reference during OP-Phase 1 implementation, not for one-time approval.

**Date:** 2026-09-18. All citations confirmed by direct file reads against branch `p0-migration-baseline`. Phase 0 makes zero changes to any file listed here — this is read-only evidence.

---

## 1. Desktop "double upload" path

The original `File` object is discarded the moment quality-check passes; only a blob URL and metadata survive:

- `src/lib/hooks/useCaptureSlots.ts:75-106` — `submitImage(angle, file: File)` passes the real `File` into `checkImageQuality` (a real network call), then on success does `const objectUrl = URL.createObjectURL(file)` and keeps only `{angle, fileName, url: objectUrl, sizeBytes}` in state. The original `File` reference is never stored anywhere after this point.
- `src/types/scan.ts:28-46` — `UploadedImage` has a `url: string` field and no `File`/`Blob` field at all. This isn't an implementation oversight; the type itself makes the discard permanent — there's structurally nowhere to put the original object even if the hook wanted to keep it.
- `src/components/scan/ScanWizard.tsx:150-196` — `finishSubmit` re-fetches each slot's blob URL (`fetch(image.url).then(r => r.blob())`) and re-uploads the resulting `Blob` via multipart `POST /scans` (`src/lib/api/scans.ts:88-94`). This is the second upload: the same image bytes cross the network twice, once as the original `File` (quality-check) and once as a re-fetched `Blob` (final submit).
- **`URL.revokeObjectURL` is never called anywhere in the codebase** (confirmed absent from `useCaptureSlots.ts`, `ScanWizard.tsx`, `CaptureSlot.tsx`) — a memory leak, and also incidentally the only reason the blob-URL round-trip "works" today (a revoked URL would break `finishSubmit`'s re-fetch).
- Risk this creates: `fetch(blobUrl).blob()` returns a plain `Blob`, not a `File` — the original filename has to be manually re-attached from the separately-stored string (`scans.ts:92`, `formData.append(image.angle, blob, image.fileName)`), and any other `File` metadata (`lastModified`, etc.) is not reconstructible at all. The bytes/MIME type are generally preserved faithfully by browser blob-URL machinery while the source `Blob` is still alive and referenced — but nothing in this code path explicitly pins that reference; behavior depends on the browser's blob-URL lifecycle rather than an explicit guarantee.

## 2. Canvas-capture path — no provenance tagging

- `src/components/scan/CameraPreview.tsx:58-75` — `canvas.toBlob((blob) => onCapture(new File([blob], \`capture-${Date.now()}.jpg\`, {type: "image/jpeg"})), "image/jpeg", 0.92)`. Uses `toBlob()` (not `toDataURL()`), JPEG at quality 0.92.
- **No metadata anywhere** distinguishes a canvas-captured image from a real file-picker-selected one. `CaptureSlotState`/`UploadedImage` (`src/types/scan.ts`) carry no `source`/`captureMethod`/`isCanvasFallback` field. `CaptureSlot.tsx:90-94` (`handleFileInput`) and `CaptureSlot.tsx:96-99` (`handleCameraCapture`) both funnel into the identical `onFileSelected(file)` callback.
- `CameraPreview` is shared verbatim by desktop (`CaptureSlot.tsx:111-115`) and mobile (`MobileCaptureView.tsx:265-269`) — both intake paths lose provenance identically. This means the spec's requirement to "prefer a full-resolution still photo over a canvas video-frame snapshot, and treat canvas JPEG capture as a tagged compatibility fallback, not as the sensor original" is unimplemented on both platforms today, not just one.

## 3. Mobile — already the closest precedent to the target model

Real-mode path (`isMockMode()` false), `MobileCaptureView.tsx:169-199`:

```
await uploadMobileCaptureImage(token, nextAngle!, file);
```

→ `src/lib/api/scans.ts:383-391` — single `FormData` with the real `File`, POST to `/mobile-handoff/{token}/images/{angle}` → `backend/app/api/v1/mobile_handoff.py:313-406 upload_mobile_image`, which runs `evaluate_image_quality` itself and, if it passes, immediately persists to S3/`EvidenceImage` in the same request.

**This confirms: one upload per image, no blob-URL round-trip, no second re-upload at finalize time.** `finalizeMobileHandoff` (`ScanWizard.tsx:162-169` → `scans.ts:408-417` → `mobile_handoff.py:222-288`) sends only JSON metadata (category/region/manufacturer) — no image bytes are re-sent at all.

| | Desktop (`ScanWizard`) | Mobile (`MobileCaptureView`) |
|---|---|---|
| Quality check | Separate call, file discarded after (blob URL kept) | Combined into the upload call — no separate pre-check round trip |
| Persistence | Not persisted until final `POST /scans` at submit time | Persisted (`EvidenceImage` row + S3 object) the instant the phone image passes |
| Submit | Re-fetches every passed slot's blob URL and re-uploads via multipart `POST /scans` | Sends only JSON metadata — no image bytes at all |

**OP-Phase 1 should generalize the mobile path to desktop, not invent a third pattern.**

## 4. Quality-verdict collapse — boolean vs. 3-state, no override anywhere

- Frontend: `QualityCheckResult{passed: boolean, failureReason?}` (`src/types/scan.ts:81-85`) — binary only. `QUALITY_FAILURE_REASONS` (`scan.ts:73-78`) is a flat 4-item reason enum (`blur|distortion|curvature|no_text_detected`), not a verdict-state enum — do not confuse the two.
- Backend: `QualityVerdict{PASS|RECAPTURE_REQUIRED|REVIEW}` (`backend/app/services/image_quality.py:46-49`) — genuinely 3-state, rolled up per-check via `_verdict_from_checks` (any `RECAPTURE_REQUIRED` wins, else any `REVIEW` wins, else `PASS`).
- **The backend silently collapses `REVIEW` into `passed:true` before the frontend ever sees it**: `check_scan_image_quality` (`backend/app/api/v1/scans.py:225-255`) only returns `{"passed": false}` for `RECAPTURE_REQUIRED`; `REVIEW` falls through to the `{"passed": true}` branch. The frontend genuinely cannot distinguish "this passed cleanly" from "this passed with quality concerns" today.
- **Neither side has a 4th `OVERRIDDEN` state, or any override UI/API, today.** No override button/flow exists anywhere in `CaptureSlot.tsx`, `CaptureSlotGrid.tsx`, or `ScanWizard.tsx` (confirmed by direct search). The spec's proposed `PASS / PASS_WITH_WARNINGS / RECAPTURE_REQUIRED / OVERRIDDEN` model is genuinely new work, not a refinement of an existing mechanism.
- Quality-check today is always a real network round trip in the main officer scan flow — the only local/in-browser heuristic anywhere (`src/lib/utils/photoQuality.ts:24-148`, a 96px blur/darkness check) belongs to the unrelated citizen-grievance flow, not this path. There is no existing "disposable downscaled advisory check" for the officer scan flow to build on; OP-Phase 1 adds this from scratch.

## 5. Files likely to change in OP-Phase 1 (forward reference only — not touched in Phase 0)

Frontend: `src/lib/hooks/useCaptureSlots.ts`, `src/components/scan/ScanWizard.tsx`, `src/components/scan/CaptureSlot.tsx`, `src/components/scan/CaptureSlotGrid.tsx`, `src/components/scan/CameraPreview.tsx`, `src/lib/api/scans.ts`, `src/lib/constants/api-endpoints.ts`, `src/types/scan.ts`, `src/components/scan/MobileCaptureView.tsx` (smaller changes — already close), `src/components/scan/MobileHandoffPanel.tsx`, `src/lib/hooks/useMobileHandoffSession.ts`.

Backend: `backend/app/api/v1/scans.py` (`create_scan_session_from_images`, `check_scan_image_quality`, `create_scan` restructured into draft-create / per-image-upload / idempotent-finalize), `backend/app/api/v1/mobile_handoff.py` (unification target, not a rewrite), `backend/app/services/image_quality.py` (verdict shape exposed directly instead of collapsed through a boolean).

This list is informational for whoever picks up OP-Phase 1 — confirm exact file names against the repository state at that time, per the spec's own instruction #3 ("paths/line refs describe the audited revision and may have moved").
