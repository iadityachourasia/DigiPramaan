/**
 * analytics.ts — dashboard and analytics API client.
 *
 * Phase 5: fetchDashboardData() cuts over to the real FastAPI backend
 * (GET /dashboard, apiGet's Bearer-token convention) — the aggregate is
 * scoped server-side to the authenticated officer, so no viewerId query
 * param is needed any more (the old mock route trusted a client-supplied
 * id; the real backend never does). fetchAnalyticsData() stays on the mock
 * route — the Analytics page (page 7) is outside Phase 5's demo path.
 */

import type { AnalyticsData, DashboardData } from "@/types";
import { apiGet } from "./client";
import type { ApiResult } from "./client";

export function fetchDashboardData(): Promise<ApiResult<DashboardData>> {
  return apiGet("/dashboard");
}

/**
 * Summary/violation/category/region/source breakdowns come from
 * `GET /api/analytics` — the mock route (outside Phase 5's demo path).
 * Trend and anomalies still come from the static mock data.
 */
export async function fetchAnalyticsData(viewerId?: string): Promise<ApiResult<AnalyticsData>> {
  const { MOCK_TREND, MOCK_ANOMALIES } = await import("@/lib/mock");
  try {
    const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
    const response = await fetch(`/api/analytics${query}`);
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
