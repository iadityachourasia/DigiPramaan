/**
 * scans.ts — scan/upload API client.
 */

import { API } from "@/lib/constants";
import { apiGet, apiUpload, isMockMode, type ApiResult } from "./client";

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

export async function createScan(
  formData: FormData
): Promise<ApiResult<ScanResponse>> {
  if (isMockMode()) {
    const { MOCK_RECORDS } = await import("@/lib/mock");
    const firstRecord = MOCK_RECORDS[0];
    if (!firstRecord)
      return { ok: false, status: 500, message: "No mock records available" };
    return {
      ok: true,
      data: {
        id: `scan-${Date.now()}`,
        recordId: firstRecord.id,
        status: "Processing",
        createdAt: new Date().toISOString(),
      },
    };
  }
  return apiUpload(API.scans.create, formData);
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
