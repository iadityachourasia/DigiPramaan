/**
 * activity.ts — Global Activity Log API client (13 §3.2).
 *
 * A real HTTP call, never gated by `isMockMode()`, matching every other
 * server-authoritative surface. The log lives in the server process; a
 * client-side branch would only ever see this tab's own events.
 */

import type { ActivityFilters, ActivityPage, ActivitySort } from "@/types";
import type { ApiResult } from "./client";

export interface ActivityPageResponse extends ActivityPage {
  /** Regions present in the log, for the filter's options. */
  availableRegions: string[];
  /** Record id → scan id, so a row can name the record the way a person does. */
  recordLabels: Record<string, string>;
}

/**
 * Builds the query string `GET /api/activity` expects. Every multi-value
 * dimension repeats its key, matching `URLSearchParams.getAll()` on the server
 * and `useSearchParams().getAll()` on the client — the same convention
 * Compliance Records established, so neither side needs custom splitting.
 */
export function buildActivityQuery(
  filters: ActivityFilters,
  sort: ActivitySort,
  page: number,
  pageSize: number
): string {
  const params = new URLSearchParams();

  for (const value of filters.actorUserIds) params.append("actorUserIds", value);
  for (const value of filters.types) params.append("types", value);
  for (const value of filters.regions) params.append("regions", value);

  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.recordId) params.set("recordId", filters.recordId);

  params.set("sort", sort);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  return params.toString();
}

export async function fetchActivity(
  filters: ActivityFilters,
  sort: ActivitySort,
  page: number,
  pageSize: number
): Promise<ApiResult<ActivityPageResponse>> {
  const path = `/api/activity?${buildActivityQuery(filters, sort, page, pageSize)}`;
  try {
    const response = await fetch(path);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `Request to ${path} failed with status ${response.status}`,
      };
    }
    return { ok: true, data: (await response.json()) as ActivityPageResponse };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}
