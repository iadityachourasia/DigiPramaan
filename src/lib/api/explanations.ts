/**
 * explanations.ts — Phase 6's Gemini violation explanation API client.
 * Real backend only (POST /records/{id}/violations/{ruleId}/explain) — no
 * mock equivalent exists, same convention as productDna.ts/cases.ts.
 */

import { API } from "@/lib/constants";
import { apiPost } from "./client";
import type { ApiResult } from "./client";

export interface ExplanationOutput {
  summary: string;
  whatWasFound: string;
  whatIsMissingOrWrong: string;
  legalContext: string;
  evidenceExplanation: string;
  officerGuidance: string;
  insufficientContext: boolean;
}

export interface ExplainViolationResponse {
  explanation: ExplanationOutput;
  cached: boolean;
  generatedAt: string;
}

export function explainViolation(
  recordId: string,
  ruleId: string
): Promise<ApiResult<ExplainViolationResponse>> {
  return apiPost(API.records.explainViolation(recordId, ruleId), {});
}
