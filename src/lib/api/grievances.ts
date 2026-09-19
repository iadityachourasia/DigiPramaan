/**
 * grievances.ts — Citizen Grievance Portal API client (page 11).
 *
 * §AF (2026-09-20): real branch added, calling backend/app/api/v1/
 * grievances.py — the one public, unauthenticated, no-account surface in
 * this product (no Bearer token, gated by isMockMode() like every other
 * real client module). `POST /grievances` is multipart (a real photo
 * File, not a data-URL reference), so this bypasses client.ts's JSON-only
 * apiPost and posts FormData directly against NEXT_PUBLIC_API_BASE_URL.
 *
 * The mock branch is kept for isMockMode() — it still expects photo
 * metadata rather than a File, which useGrievanceForm.ts's mock path never
 * changed.
 */

import type {
  GrievanceConcern,
  GrievanceReceipt,
  GrievanceStatusLookup,
} from "@/types";
import { isMockMode } from "./client";
import type { ApiResult } from "./client";

const REAL_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

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
  /** Mock mode: already-uploaded photo metadata. Real mode: the raw File — see submitGrievanceReal(). */
  photo: { fileName: string; url: string; sizeBytes: number } | File;
  concerns: GrievanceConcern[];
  concernNote?: string;
  shopNameOrLocation?: string;
  submitterName?: string;
  submitterContact?: string;
  /** The advisory photo check's outcome. Mock mode only — the real backend
   * computes its own quality note server-side from the uploaded photo. */
  qualityNote?: string;
  /** Honeypot. Always empty from a real person; the field is hidden from them. */
  website?: string;
}

async function submitGrievanceReal(
  params: SubmitGrievanceParams & { photo: File }
): Promise<ApiResult<GrievanceReceipt>> {
  const form = new FormData();
  form.set("photo", params.photo, params.photo.name);
  form.set("concerns", JSON.stringify(params.concerns));
  if (params.concernNote) form.set("concern_note", params.concernNote);
  if (params.shopNameOrLocation) form.set("shop_name_or_location", params.shopNameOrLocation);
  if (params.submitterName) form.set("submitter_name", params.submitterName);
  if (params.submitterContact) form.set("submitter_contact", params.submitterContact);
  if (params.website) form.set("website", params.website);

  try {
    const response = await fetch(`${REAL_API_BASE}/grievances`, { method: "POST", body: form });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      return {
        ok: false,
        status: response.status,
        message: body?.error?.message ?? `POST /grievances failed with status ${response.status}`,
      };
    }
    return { ok: true, data: (await response.json()) as GrievanceReceipt };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}

export function submitGrievance(
  params: SubmitGrievanceParams
): Promise<ApiResult<GrievanceReceipt>> {
  if (!isMockMode() && params.photo instanceof File) {
    return submitGrievanceReal(params as SubmitGrievanceParams & { photo: File });
  }
  return requestJson("/api/grievances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

async function lookupGrievanceReal(reference: string): Promise<ApiResult<GrievanceStatusLookup>> {
  try {
    const response = await fetch(`${REAL_API_BASE}/grievances/${encodeURIComponent(reference)}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      return {
        ok: false,
        status: response.status,
        message: body?.error?.message ?? `GET /grievances/${reference} failed with status ${response.status}`,
      };
    }
    return { ok: true, data: (await response.json()) as GrievanceStatusLookup };
  } catch {
    return { ok: false, status: 0, message: "Network error" };
  }
}

export function lookupGrievance(
  reference: string
): Promise<ApiResult<GrievanceStatusLookup>> {
  if (!isMockMode()) return lookupGrievanceReal(reference);
  return requestJson(`/api/grievances/${encodeURIComponent(reference)}`);
}
