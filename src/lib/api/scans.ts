/**
 * scans.ts — scan/upload API client.
 */

import { API } from "@/lib/constants";
import type {
  CaptureSlotAngle,
  MobileHandoffSession,
  PipelineRun,
  PipelineStageId,
  QualityCheckResult,
  QualityFailureReason,
  ScanMetadata,
} from "@/types";

import type { ComplianceRecord } from "@/types";
import { apiGet, apiPost, apiUpload, isMockMode, type ApiResult } from "./client";

/**
 * Lightweight response type for scan create/status.
 * The full Scan type from @/types contains the complete extraction pipeline
 * model. This API layer returns the tracking subset needed by the upload UI.
 */
export interface ScanResponse {
  id: string;
  recordId: string;
  status: string;
  createdAt: string;
}

export interface CreateScanRequest {
  metadata: ScanMetadata;
  /** Passed-quality images only — a slot that never cleared the gate is not here. */
  images: Array<{ angle: CaptureSlotAngle; fileName: string; url: string; sizeBytes: number }>;
  /** The signed-in officer — becomes the pipeline run's/record's "Scanned" audit actor. */
  scannedByUserId: string;
  /** `?demo=pipeline-fail-<stage>` on the wizard's own URL — forwarded, not decided here. */
  forceFailStage?: PipelineStageId;
  fallbackOverride?: "used" | "skipped";
}

export async function createScan(
  request: CreateScanRequest
): Promise<ApiResult<ScanResponse>> {
  if (isMockMode()) {
    const id = `scan-${Date.now()}`;

    /*
     * The Processing Pipeline Tracker (03 §2 Step 5) needs server-side state
     * that survives a closed tab — the same reason Mobile Handoff isn't a
     * client mock (see scan-pipeline-store.ts) — so submitting a scan means
     * creating that run now, not just returning a fake ID for a page that
     * will find nothing when it polls.
     */
    const pipelineResult = await createScanPipeline({
      scanId: id,
      metadata: request.metadata,
      images: request.images,
      scannedByUserId: request.scannedByUserId,
      ...(request.forceFailStage ? { forceFailStage: request.forceFailStage } : {}),
      ...(request.fallbackOverride ? { fallbackOverride: request.fallbackOverride } : {}),
    });

    if (!pipelineResult.ok) {
      return { ok: false, status: pipelineResult.status, message: pipelineResult.message };
    }

    return {
      ok: true,
      data: {
        id,
        recordId: pipelineResult.data.recordId,
        status: "Processing",
        createdAt: new Date().toISOString(),
      },
    };
  }
  const formData = new FormData();
  formData.append("metadata", JSON.stringify(request.metadata));
  formData.append("images", JSON.stringify(request.images));
  return apiUpload(API.scans.create, formData);
}

/* ------------------------------------------------------------------ *
 * Phase 6 — Rule 7 manual calibration
 * ------------------------------------------------------------------ *
 * Real backend only, no mock equivalent (same convention as
 * productDna.ts/cases.ts) — establishes SCALE ONLY, never perspective
 * correction (see backend's measurement/font_height.py docstring).
 */

export interface CalibrationPoint {
  x: number;
  y: number;
}

export interface SubmitCalibrationRequest {
  /** Which captured angle the officer clicked the two points on — the
   * backend derives the real evidence image id from the field's own OCR
   * evidence and cross-checks it matches this angle. */
  angle: "front" | "back" | "side_pdp";
  fieldId: "netQuantity" | "retailSalePrice";
  knownDimensionMm: number;
  startPoint: CalibrationPoint;
  endPoint: CalibrationPoint;
  isEmbossed?: boolean;
}

export function submitCalibration(
  scanId: string,
  request: SubmitCalibrationRequest
): Promise<ApiResult<ComplianceRecord>> {
  return apiPost(API.scans.calibrate(scanId), {
    angle: request.angle,
    field_id: request.fieldId,
    known_dimension_mm: request.knownDimensionMm,
    start_point: request.startPoint,
    end_point: request.endPoint,
    is_embossed: request.isEmbossed ?? false,
  });
}

export async function fetchScan(id: string): Promise<ApiResult<ScanResponse>> {
  if (isMockMode()) {
    return {
      ok: true,
      data: {
        id,
        recordId: `rec-${id}`,
        status: "Completed",
        createdAt: new Date().toISOString(),
      },
    };
  }
  return apiGet(API.scans.detail(id));
}

/* ------------------------------------------------------------------ *
 * Image Quality Inspection Layer (03-scan-upload.md §2)
 * ------------------------------------------------------------------ */

export interface QualityCheckRequest {
  angle: CaptureSlotAngle;
  file: File;
}

/**
 * `simulateFailure` exists only for demoing/testing every rejection reason on
 * demand (see the Dashboard's established `?demo=` convention). It is read by
 * the mock branch only — a real backend call never receives or needs it, so
 * wiring the real endpoint means deleting the mock branch, not this parameter.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function checkImageQuality(
  request: QualityCheckRequest,
  simulateFailure?: QualityFailureReason
): Promise<ApiResult<QualityCheckResult>> {
  if (isMockMode()) {
    /* Near-instant per 03 §2 — long enough to see "Checking…", never a real wait. */
    await delay(400 + Math.random() * 300);

    if (simulateFailure) {
      return { ok: true, data: { passed: false, failureReason: simulateFailure } };
    }
    return { ok: true, data: { passed: true } };
  }

  const formData = new FormData();
  formData.append("angle", request.angle);
  formData.append("file", request.file);
  return apiUpload(API.scans.qualityCheck, formData);
}

/* ------------------------------------------------------------------ *
 * Mobile Handoff session (03-scan-upload.md §2, Mobile Handoff Panel)
 * ------------------------------------------------------------------ *
 * Deliberately NOT gated by isMockMode(). This is the one part of the
 * page's data layer where "mock" and "real" already share the exact same
 * client-side code path — the desktop tab and the phone are two separate
 * browser contexts that both need to see one shared session, which no
 * client-side mock branch can provide (see mobile-session-store.ts). The
 * mock-ness lives entirely in that server module; swapping in a real backend
 * later means changing the route handlers, not these functions or their
 * callers.
 */

async function requestJson<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, init);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        ok: false,
        status: response.status,
        message: body?.error ?? `Request to ${path} failed with status ${response.status}`,
      };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}

export function createMobileSession(
  scanDraftId: string
): Promise<ApiResult<MobileHandoffSession>> {
  return requestJson("/api/mobile-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanDraftId }),
  });
}

export function pollMobileSession(token: string): Promise<ApiResult<MobileHandoffSession>> {
  return requestJson(`/api/mobile-sessions/${token}`);
}

export function cancelMobileSession(token: string): Promise<ApiResult<MobileHandoffSession>> {
  return requestJson(`/api/mobile-sessions/${token}`, { method: "DELETE" });
}

export function connectMobileSession(token: string): Promise<ApiResult<MobileHandoffSession>> {
  return requestJson(`/api/mobile-sessions/${token}/connect`, { method: "POST" });
}

export interface ReportMobileCaptureRequest {
  angle: CaptureSlotAngle;
  fileName: string;
  sizeBytes: number;
  /** A data: URL — see mobile-session-store.ts for why. */
  dataUrl: string;
}

export function reportMobileCapture(
  token: string,
  request: ReportMobileCaptureRequest
): Promise<ApiResult<MobileHandoffSession>> {
  return requestJson(`/api/mobile-sessions/${token}/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

/* ------------------------------------------------------------------ *
 * Processing Pipeline Tracker (03-scan-upload.md §2, Step 5)
 * ------------------------------------------------------------------ *
 * This is server-authoritative state (must survive a closed tab) either
 * way, but WHICH server depends on mode, same as createScan/fetchScan
 * above: in mock mode it's scan-pipeline-store.ts's Route Handlers
 * (src/app/api/scan-pipelines/), in real mode it's the actual FastAPI
 * backend's GET/POST /scans/{id}/pipeline... (real scan_session.stages).
 *
 * Phase 8 fix: pollScanPipeline/retryPipelineStage previously called the
 * mock route UNCONDITIONALLY — a real (non-mock) scan is created via
 * apiUpload(API.scans.create, ...) above, which never populates the mock
 * store, so the tracker page polled a run that was never there. Branching
 * on isMockMode() here, exactly like createScan/fetchScan already do, is
 * what makes "use actual backend state" (rather than fake/absent state)
 * true for a real scan.
 */

export interface CreateScanPipelineRequest {
  scanId: string;
  metadata: ScanMetadata;
  images: Array<{ angle: CaptureSlotAngle; fileName: string; url: string; sizeBytes: number }>;
  scannedByUserId: string;
  forceFailStage?: PipelineStageId;
  fallbackOverride?: "used" | "skipped";
}

export function createScanPipeline(
  request: CreateScanPipelineRequest
): Promise<ApiResult<PipelineRun>> {
  return requestJson("/api/scan-pipelines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function pollScanPipeline(scanId: string): Promise<ApiResult<PipelineRun>> {
  if (isMockMode()) {
    return requestJson(`/api/scan-pipelines/${scanId}`);
  }
  return apiGet(API.scans.pipeline(scanId));
}

export function retryPipelineStage(
  scanId: string,
  stageId: PipelineStageId
): Promise<ApiResult<PipelineRun>> {
  if (isMockMode()) {
    return requestJson(`/api/scan-pipelines/${scanId}/retry/${stageId}`, { method: "POST" });
  }
  return apiPost(API.scans.pipelineRetry(scanId, stageId), {});
}
