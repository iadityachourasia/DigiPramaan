/**
 * manufacturers.ts — manufacturer scorecard API client.
 */

import type { ManufacturerScorecard } from "@/types";
import { API } from "@/lib/constants";
import { apiGet, isMockMode, type ApiResult } from "./client";

export interface ManufacturerListResponse {
  scorecards: ManufacturerScorecard[];
  total: number;
}

export async function fetchManufacturers(): Promise<
  ApiResult<ManufacturerListResponse>
> {
  if (isMockMode()) {
    const { MOCK_SCORECARDS } = await import("@/lib/mock");
    return {
      ok: true,
      data: { scorecards: [...MOCK_SCORECARDS], total: MOCK_SCORECARDS.length },
    };
  }
  return apiGet(API.manufacturers.list);
}

export async function fetchManufacturerScorecard(
  id: string
): Promise<ApiResult<ManufacturerScorecard>> {
  if (isMockMode()) {
    const { MOCK_SCORECARDS } = await import("@/lib/mock");
    const scorecard = MOCK_SCORECARDS.find((s) => s.summary.id === id);
    if (!scorecard)
      return { ok: false, status: 404, message: "Manufacturer not found" };
    return { ok: true, data: scorecard };
  }
  return apiGet(API.manufacturers.scorecard(id));
}
