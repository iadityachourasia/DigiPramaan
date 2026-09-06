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

/**
 * Summary/violation/category/region/source breakdowns come from
 * `GET /api/analytics` — a real HTTP call, never gated by `isMockMode()`,
 * same reasoning as every other server-authoritative surface in this app:
 * it must see records the live pipeline created, not just the static
 * seeds a client-side mock branch would be limited to (the same bug page
 * 5's `fetchRecords()` had before its own fix). Trend and anomalies still
 * come from the static mock data — see `computeAnalyticsSummary()`'s own
 * doc comment for why those two stay illustrative.
 */
export async function fetchAnalyticsData(): Promise<ApiResult<AnalyticsData>> {
  const { MOCK_TREND, MOCK_ANOMALIES } = await import("@/lib/mock");
  try {
    const response = await fetch("/api/analytics");
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `GET /api/analytics failed with status ${response.status}`,
      };
    }
    const aggregate = (await response.json()) as Omit<AnalyticsData, "trend" | "anomalies">;
    return {
      ok: true,
      data: { ...aggregate, trend: [...MOCK_TREND], anomalies: [...MOCK_ANOMALIES] },
    };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}
