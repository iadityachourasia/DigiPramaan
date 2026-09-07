/**
 * manufacturers.ts — Manufacturer Compliance Scorecard API client (page 9).
 *
 * Real HTTP calls to `scan-pipeline-store.ts`'s Route Handlers, never gated
 * by `isMockMode()` — same reasoning as records.ts and analytics.ts. A
 * scorecard aggregates over the live record set; a client-side mock branch
 * would only ever see the static seeds, so a manufacturer scanned through
 * the pipeline today would be missing from their own scorecard. That's the
 * bug pages 5 and 7 each shipped with before their own fixes.
 */

import type { ComplianceRecord, ManufacturerScorecard } from "@/types";
import type { ApiResult } from "./client";

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

export interface ManufacturerListResponse {
  scorecards: ManufacturerScorecard[];
  total: number;
}

/**
 * `viewerId` scopes every scorecard's numbers to that user's jurisdiction
 * and role (13 §4 plan) — see records.ts's `fetchRecords` for the same
 * convention.
 */
export function fetchManufacturers(
  viewerId?: string
): Promise<ApiResult<ManufacturerListResponse>> {
  const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
  return requestJson(`/api/manufacturers${query}`);
}

export function fetchManufacturerScorecard(
  id: string,
  viewerId?: string
): Promise<ApiResult<ManufacturerScorecard>> {
  const query = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
  return requestJson(`/api/manufacturers/${id}/scorecard${query}`);
}

export interface ManufacturerFlagResponse {
  flagged: ComplianceRecord[];
  /** Static-seed records with no backing pipeline run — surfaced, not swallowed. */
  skipped: string[];
  alreadyFlagged: string[];
}

export function flagManufacturerForEnforcement(
  id: string,
  userId: string
): Promise<ApiResult<ManufacturerFlagResponse>> {
  return requestJson(`/api/manufacturers/${id}/flag-enforcement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}
