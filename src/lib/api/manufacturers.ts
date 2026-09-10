/**
 * manufacturers.ts — Manufacturer Compliance Scorecard API client (page 9).
 *
 * Phase 5: cut over to the real backend's Company Profile (Phase 4) via the
 * companies.ts adapter (adapt the response shape, don't duplicate the page
 * — see that file's own doc comment). flagManufacturerForEnforcement has no
 * real backend equivalent (Follow-Through operates per-record, via
 * flagForEnforcement in records.ts) and stays on the mock route, outside
 * Phase 5's demo path.
 */

import { API } from "@/lib/constants";
import {
  companyListToSummary,
  companyProfileToScorecard,
  type CompanyListEntry,
  type CompanyProfileResponse,
} from "@/lib/api/companies";
import type { ComplianceRecord, ManufacturerScorecard } from "@/types";
import { apiGet } from "./client";
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

export async function fetchManufacturers(): Promise<ApiResult<ManufacturerListResponse>> {
  const result = await apiGet<CompanyListEntry[]>(API.companies.list);
  if (!result.ok) return result;
  const summaries = companyListToSummary(result.data);
  const scorecards: ManufacturerScorecard[] = summaries.map((summary) => ({
    summary,
    repeatViolationFlagged: false,
    recentNonCompliantCount: 0,
    repeatViolationThreshold: { nonCompliantCount: 3, withinDays: 90 },
    complianceTrend: [],
    violationBreakdown: [],
    products: [],
  }));
  return { ok: true, data: { scorecards, total: scorecards.length } };
}

export async function fetchManufacturerScorecard(id: string): Promise<ApiResult<ManufacturerScorecard>> {
  const result = await apiGet<CompanyProfileResponse>(API.companies.profile(id));
  if (!result.ok) return result;
  return { ok: true, data: companyProfileToScorecard(result.data) };
}

export interface ManufacturerFlagResponse {
  flagged: ComplianceRecord[];
  /** Static-seed records with no backing pipeline run — surfaced, not swallowed. */
  skipped: string[];
  alreadyFlagged: string[];
}

/** No real per-manufacturer bulk-flag endpoint — Follow-Through operates per-record (records.ts). Stays mock. */
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
