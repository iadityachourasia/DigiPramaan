/**
 * productDna.ts — Product Compliance DNA, Phase 4. Calls the REAL FastAPI
 * backend directly via client.ts's apiGet/apiPost (Bearer token,
 * NEXT_PUBLIC_API_BASE_URL) — NOT the relative-URL requestJson pattern
 * records.ts/manufacturers.ts use for the mock Next.js route handlers.
 * There is no mock equivalent for this data (net-new in Phase 4), so this
 * module always calls the real backend regardless of NEXT_PUBLIC_USE_MOCK_DATA.
 */

import { apiGet, type ApiResult } from "./client";
import { API } from "@/lib/constants/api-endpoints";

export interface InspectionTimelineEntry {
  recordId: string;
  scannedAt: string | null;
  verifiedAt: string | null;
  complianceStatus: string;
  complianceScore: number | null;
}

export interface RecurringViolation {
  categoryId: string;
  count: number;
}

export interface ProductDna {
  productId: string;
  fingerprintHash: string;
  brand: string | null;
  genericName: string;
  netQuantityNormalized: string;
  category: string | null;
  legalEntity: { id: string; name: string } | null;
  inspectionTimeline: InspectionTimelineEntry[];
  recurringViolations: RecurringViolation[];
  relatedRecordIds: string[];
  openCase: { id: string; status: string } | null;
  riskScore: number;
  riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  riskReasons: string[];
}

export async function fetchProductDna(productId: string): Promise<ApiResult<ProductDna>> {
  return apiGet<ProductDna>(API.products.dna(productId));
}
