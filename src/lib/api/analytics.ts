/**
 * analytics.ts — dashboard and analytics API client.
 */

import type { AnalyticsData, DashboardData } from "@/types";
import { API } from "@/lib/constants";
import { type ApiResult } from "./client";

/** Dashboard reads a server-derived, viewer-scoped response even in demo mode. */
export async function fetchDashboardData(viewerId?: string): Promise<ApiResult<DashboardData>> {
  try {
    const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
    const response = await fetch(`/api${API.analytics.dashboard}${query}`);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `GET /api${API.analytics.dashboard} failed with status ${response.status}`,
      };
    }
    return { ok: true, data: (await response.json()) as DashboardData };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
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
export async function fetchAnalyticsData(viewerId?: string): Promise<ApiResult<AnalyticsData>> {
  const { MOCK_TREND, MOCK_ANOMALIES } = await import("@/lib/mock");
  try {
    /* Scopes the breakdowns to the viewer's jurisdiction and role (13 §4
     * plan) — see fetchRecords's own doc comment for the same convention. */
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
