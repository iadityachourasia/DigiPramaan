/**
 * analytics.ts — dashboard and analytics API client.
 */

import type { AnalyticsData, KpiMetric } from "@/types";
import { API } from "@/lib/constants";
import { apiGet, isMockMode, type ApiResult } from "./client";

export async function fetchDashboardKpis(): Promise<ApiResult<KpiMetric[]>> {
  if (isMockMode()) {
    const { MOCK_KPIS } = await import("@/lib/mock");
    return { ok: true, data: [...MOCK_KPIS] };
  }
  return apiGet(API.analytics.dashboard);
}

export async function fetchAnalyticsData(): Promise<ApiResult<AnalyticsData>> {
  if (isMockMode()) {
    const { MOCK_ANALYTICS } = await import("@/lib/mock");
    return { ok: true, data: MOCK_ANALYTICS };
  }
  return apiGet(API.analytics.trends);
}
