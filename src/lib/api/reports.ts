/**
 * reports.ts — report generation API client.
 */

import type { ReportFormat, ReportScope } from "@/types";
import { API } from "@/lib/constants";
import { apiGet, apiPost, isMockMode, type ApiResult } from "./client";

export interface GenerateReportParams {
  scope: ReportScope;
  format: ReportFormat;
  dateFrom: string;
  dateTo: string;
}

/**
 * Lightweight response type for report generation tracking.
 * The full GeneratedReport from @/types carries a richer shape;
 * this covers the API response subset.
 */
export interface ReportResponse {
  id: string;
  name: string;
  status: string;
  generatedAt: string;
}

export async function generateReport(
  params: GenerateReportParams
): Promise<ApiResult<ReportResponse>> {
  if (isMockMode()) {
    return {
      ok: true,
      data: {
        id: `rpt-${Date.now()}`,
        name: `Compliance Report — ${params.dateFrom} to ${params.dateTo}`,
        status: "completed",
        generatedAt: new Date().toISOString(),
      },
    };
  }
  return apiPost(API.reports.generate, params);
}

export async function fetchReports(): Promise<ApiResult<ReportResponse[]>> {
  if (isMockMode()) {
    return { ok: true, data: [] };
  }
  return apiGet(API.reports.list);
}
