/**
 * grievances.ts — Citizen Grievance Portal API client (page 11).
 *
 * Real HTTP calls to the grievance Route Handlers, never gated by
 * `isMockMode()` — the same server-authoritative rule records, analytics,
 * manufacturers and reports all follow. A tracking reference has to be
 * resolvable from a different device an hour later, which a client-side mock
 * branch cannot do.
 *
 * Replaces an earlier stub that contradicted itself three ways: it minted
 * `GRV-` base36 references matching neither the fixtures nor the reference
 * generator, its lookup ignored the reference entirely and always reported
 * "Under Review" so an unknown code appeared to succeed, and its response type
 * matched neither `GrievanceReceipt` nor `GrievanceStatusLookup`.
 */

import type {
  GrievanceConcern,
  GrievanceReceipt,
  GrievanceStatusLookup,
} from "@/types";
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

export interface SubmitGrievanceParams {
  photo: { fileName: string; url: string; sizeBytes: number };
  concerns: GrievanceConcern[];
  concernNote?: string;
  shopNameOrLocation?: string;
  submitterName?: string;
  submitterContact?: string;
  /** The advisory photo check's outcome. Recorded on the record, never a gate. */
  qualityNote?: string;
  /** Honeypot. Always empty from a real person; the field is hidden from them. */
  website?: string;
}

export function submitGrievance(
  params: SubmitGrievanceParams
): Promise<ApiResult<GrievanceReceipt>> {
  return requestJson("/api/grievances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export function lookupGrievance(
  reference: string
): Promise<ApiResult<GrievanceStatusLookup>> {
  return requestJson(`/api/grievances/${encodeURIComponent(reference)}`);
}
