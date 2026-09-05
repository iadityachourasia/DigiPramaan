/**
 * records.ts — compliance records API client.
 */

import type { ComplianceRecord, ComplianceStatus } from "@/types";
import { API } from "@/lib/constants";
import { apiGet, apiPost, isMockMode, type ApiResult } from "./client";

export interface RecordListParams {
  status?: ComplianceStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface RecordListResponse {
  records: ComplianceRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchRecords(
  params: RecordListParams
): Promise<ApiResult<RecordListResponse>> {
  if (isMockMode()) {
    const { MOCK_ACTIVE_RECORDS } = await import("@/lib/mock");
    let filtered = [...MOCK_ACTIVE_RECORDS];
    if (params.status) {
      filtered = filtered.filter((r) => r.complianceStatus === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.productName.toLowerCase().includes(q) ||
          r.manufacturerName.toLowerCase().includes(q)
      );
    }
    const page = params.page ?? 1;
    const size = params.pageSize ?? 10;
    const start = (page - 1) * size;
    return {
      ok: true,
      data: {
        records: filtered.slice(start, start + size),
        total: filtered.length,
        page,
        pageSize: size,
      },
    };
  }
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("q", params.search);
  if (params.page) query.set("page", params.page.toString());
  if (params.pageSize) query.set("pageSize", params.pageSize.toString());
  return apiGet(`${API.records.list}?${query.toString()}`);
}

export async function fetchRecord(
  id: string
): Promise<ApiResult<ComplianceRecord>> {
  if (isMockMode()) {
    const { MOCK_RECORDS } = await import("@/lib/mock");
    const record = MOCK_RECORDS.find((r) => r.id === id);
    if (!record) return { ok: false, status: 404, message: "Record not found" };
    return { ok: true, data: record };
  }
  return apiGet(API.records.detail(id));
}

export async function verifyRecord(
  id: string
): Promise<ApiResult<ComplianceRecord>> {
  return apiPost(API.records.verify(id), {});
}

export async function flagNeedsReview(
  id: string,
  reason: string
): Promise<ApiResult<ComplianceRecord>> {
  return apiPost(API.records.flagNeedsReview(id), { reason });
}
