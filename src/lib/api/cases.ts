/**
 * cases.ts — Compliance Follow-Through, Phase 4. Same real-backend
 * calling convention as productDna.ts — see that file's doc comment.
 */

import { apiGet, apiPost, type ApiResult } from "./client";
import { API } from "@/lib/constants/api-endpoints";

export const CASE_STATUSES = [
  "OPEN",
  "ACTION_REQUIRED",
  "REINSPECTION_REQUIRED",
  "RESOLVED",
  "CLOSED",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export interface CaseStatusHistoryEntry {
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  changedBy: string | null;
  changedAt: string | null;
  note: string | null;
}

export interface CaseDetail {
  id: string;
  status: CaseStatus;
  originatingRecordId: string;
  productId: string | null;
  assignedOfficerId: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  record: {
    id: string;
    productName: string | null;
    manufacturerName: string | null;
    complianceStatus: string;
    region: string | null;
  } | null;
  history?: CaseStatusHistoryEntry[];
}

export async function fetchCase(caseId: string): Promise<ApiResult<CaseDetail>> {
  return apiGet<CaseDetail>(API.cases.detail(caseId));
}

export async function transitionCase(
  caseId: string,
  toStatus: CaseStatus,
  note?: string
): Promise<ApiResult<CaseDetail>> {
  return apiPost<CaseDetail>(API.cases.transition(caseId), { to_status: toStatus, note });
}
