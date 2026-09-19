/**
 * analytics.ts — dashboard and analytics API client.
 *
 * Phase 5: fetchDashboardData() cuts over to the real FastAPI backend
 * (GET /dashboard, apiGet's Bearer-token convention) — the aggregate is
 * scoped server-side to the authenticated officer, so no viewerId query
 * param is needed any more (the old mock route trusted a client-supplied
 * id; the real backend never does).
 *
 * §AF (2026-09-20): fetchAnalyticsData() now also has a real branch —
 * `GET /analytics` returns the full AnalyticsData shape (summary, trends,
 * every breakdown, and anomalies: [] — anomaly detection isn't built yet,
 * an honest empty list rather than a fabricated one).
 */

import { isMockMode } from "./client";
import type { AnalyticsData, DashboardData } from "@/types";
import { apiGet } from "./client";
import type { ApiResult } from "./client";

export function fetchDashboardData(): Promise<ApiResult<DashboardData>> {
  return apiGet("/dashboard");
}

async function fetchAnalyticsDataMock(viewerId?: string): Promise<ApiResult<AnalyticsData>> {
  const { MOCK_TREND, MOCK_TREND_MONTHLY, MOCK_ANOMALIES } = await import("@/lib/mock");
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
    const aggregate = (await response.json()) as Omit<AnalyticsData, "trends" | "anomalies">;
    return {
      ok: true,
      data: {
        ...aggregate,
        trends: { weekly: [...MOCK_TREND], monthly: [...MOCK_TREND_MONTHLY] },
        anomalies: [...MOCK_ANOMALIES],
      },
    };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}

export function fetchAnalyticsData(viewerId?: string): Promise<ApiResult<AnalyticsData>> {
  if (isMockMode()) return fetchAnalyticsDataMock(viewerId);
  return apiGet<AnalyticsData>("/analytics");
}
