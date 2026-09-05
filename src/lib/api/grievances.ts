/**
 * grievances.ts — citizen grievance portal API client.
 */

import { API } from "@/lib/constants";
import { apiGet, apiUpload, isMockMode, type ApiResult } from "./client";

export interface GrievanceResponse {
  referenceNumber: string;
  status: string;
  submittedAt: string;
}

export async function submitGrievance(
  formData: FormData
): Promise<ApiResult<GrievanceResponse>> {
  if (isMockMode()) {
    const ref = `GRV-${Date.now().toString(36).toUpperCase()}`;
    return {
      ok: true,
      data: {
        referenceNumber: ref,
        status: "Received",
        submittedAt: new Date().toISOString(),
      },
    };
  }
  return apiUpload(API.grievances.submit, formData);
}

export async function lookupGrievance(
  referenceNumber: string
): Promise<ApiResult<GrievanceResponse>> {
  if (isMockMode()) {
    return {
      ok: true,
      data: {
        referenceNumber,
        status: "Under Review",
        submittedAt: new Date(Date.now() - 86400000).toISOString(),
      },
    };
  }
  return apiGet(API.grievances.lookup(referenceNumber));
}
