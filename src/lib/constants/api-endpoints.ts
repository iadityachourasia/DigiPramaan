/**
 * api-endpoints.ts — every backend API path, defined once.
 *
 * The base URL comes from NEXT_PUBLIC_API_BASE_URL in .env.local. These
 * constants are the path suffixes appended to it by src/lib/api/client.ts.
 */

export const API = {
  auth: {
    login: "/auth/login",
    logout: "/auth/logout",
    refresh: "/auth/refresh",
    me: "/auth/me",
  },

  scans: {
    create: "/scans",
    detail: (id: string) => `/scans/${id}` as const,
    extraction: (scanId: string) => `/scans/${scanId}/extraction` as const,
    qualityCheck: "/scans/quality-check",
    pipeline: (scanId: string) => `/scans/${scanId}/pipeline` as const,
    pipelineRetry: (scanId: string, stageId: string) =>
      `/scans/${scanId}/pipeline/${stageId}/retry` as const,
    calibrate: (scanId: string) => `/scans/${scanId}/calibration` as const,
    /**
     * OP-Phase 1 — upload-once intake: create a bare draft, upload each
     * accepted image exactly once, then finalize. Replaces
     * qualityCheck+create's double-upload for device/camera capture in
     * real (non-mock) mode; mock mode is unchanged.
     */
    draft: "/scans/draft",
    uploadImage: (scanId: string, angle: string) => `/scans/${scanId}/images/${angle}` as const,
    finalize: (scanId: string) => `/scans/${scanId}/finalize` as const,
  },

  /**
   * Real Mobile QR Handoff backend (Phase 10). Officer-side routes are
   * scoped by scanId under normal Bearer auth; token-side routes take
   * the raw handoff token as the sole credential — see
   * backend/app/api/deps/mobile_handoff.py's own docstring on why that's
   * a genuinely separate auth mechanism, not an extension of the officer
   * JWT one.
   */
  mobileHandoff: {
    create: "/scans/mobile-handoff",
    status: (scanId: string) => `/scans/${scanId}/mobile-handoff/status` as const,
    revoke: (scanId: string) => `/scans/${scanId}/mobile-handoff/revoke` as const,
    finalize: (scanId: string) => `/scans/${scanId}/mobile-handoff/finalize` as const,
    tokenStatus: (token: string) => `/mobile-handoff/${token}` as const,
    uploadImage: (token: string, angle: string) =>
      `/mobile-handoff/${token}/images/${angle}` as const,
    complete: (token: string) => `/mobile-handoff/${token}/complete` as const,
  },

  records: {
    list: "/records",
    detail: (id: string) => `/records/${id}` as const,
    corrections: (id: string) => `/records/${id}/corrections` as const,
    verify: (id: string) => `/records/${id}/verify` as const,
    resolutions: (id: string) => `/records/${id}/resolutions` as const,
    flagNeedsReview: (id: string) => `/records/${id}/flag-review` as const,
    flagEnforcement: (id: string) => `/records/${id}/flag-enforcement` as const,
    retryEnrichment: (id: string) => `/records/${id}/retry-enrichment` as const,
    explainViolation: (recordId: string, ruleId: string) =>
      `/records/${recordId}/violations/${ruleId}/explain` as const,
    archive: (id: string) => `/records/${id}/archive` as const,
    bulkNeedsReview: "/records/bulk/needs-review",
  },

  analytics: {
    dashboard: "/dashboard",
    trends: "/analytics/trends",
    violations: "/analytics/violations",
  },

  manufacturers: {
    list: "/manufacturers",
    scorecard: (id: string) => `/manufacturers/${id}/scorecard` as const,
    flagEnforcement: (id: string) => `/manufacturers/${id}/flag-enforcement` as const,
  },

  /**
   * Phase 4 USPs — real FastAPI backend only, no mock equivalent. Fetched
   * via src/lib/api/client.ts's apiGet/apiPost (Bearer token), never the
   * relative-URL requestJson pattern the mock-backed modules above use.
   */
  products: {
    dna: (productId: string) => `/products/${productId}/dna` as const,
  },

  companies: {
    list: "/companies",
    profile: (legalEntityId: string) => `/companies/${legalEntityId}/profile` as const,
  },

  cases: {
    detail: (caseId: string) => `/cases/${caseId}` as const,
    transition: (caseId: string) => `/cases/${caseId}/transition` as const,
  },

  ecommerce: {
    scrapePreview: "/ecommerce/scrape-preview",
    scan: "/ecommerce/scan",
    batch: "/ecommerce/batch",
    batchDetail: (id: string) => `/ecommerce/batch/${id}` as const,
  },

  reports: {
    generate: "/reports/generate",
    list: "/reports",
    download: (id: string, format: string) =>
      `/reports/${id}/download/${format}` as const,
  },

  /**
   * Phase 5 immutable reports — real FastAPI backend only, record-scope
   * reports (ReportScope.kind === "record"). Manufacturer/filtered-scope
   * reports stay on the `reports` block above (the mock route).
   */
  recordReports: {
    generate: (recordId: string) => `/records/${recordId}/reports` as const,
    byRecord: (recordId: string) => `/reports/by-record/${recordId}` as const,
    detail: (reportId: string) => `/reports/${reportId}` as const,
    retry: (reportId: string) => `/reports/${reportId}/retry` as const,
    download: (reportId: string, format: string) =>
      `/reports/${reportId}/download/${format}` as const,
  },

  /** Public, unauthenticated — the QR-verification page's data source.
   * No session token, no scope check; the backend response itself is
   * deliberately minimal (see backend/app/api/v1/reports.py::verify_report). */
  publicVerification: {
    report: (reportId: string) => `/verify/reports/${reportId}` as const,
  },

  evidenceImages: {
    stream: (imageId: string) => `/evidence-images/${imageId}` as const,
  },

  grievances: {
    submit: "/grievances",
    lookup: (reference: string) => `/grievances/${reference}` as const,
  },
} as const;
