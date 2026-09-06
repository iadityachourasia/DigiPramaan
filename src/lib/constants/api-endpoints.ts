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
    mobileSession: {
      create: "/scans/mobile-session",
      poll: (token: string) => `/scans/mobile-session/${token}` as const,
      cancel: (token: string) => `/scans/mobile-session/${token}/cancel` as const,
    },
  },

  records: {
    list: "/records",
    detail: (id: string) => `/records/${id}` as const,
    verify: (id: string) => `/records/${id}/verify` as const,
    flagNeedsReview: (id: string) => `/records/${id}/flag-review` as const,
    flagEnforcement: (id: string) => `/records/${id}/flag-enforcement` as const,
    archive: (id: string) => `/records/${id}/archive` as const,
  },

  analytics: {
    dashboard: "/analytics/dashboard",
    trends: "/analytics/trends",
    violations: "/analytics/violations",
  },

  manufacturers: {
    list: "/manufacturers",
    scorecard: (id: string) => `/manufacturers/${id}/scorecard` as const,
  },

  ecommerce: {
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

  grievances: {
    submit: "/grievances",
    lookup: (reference: string) => `/grievances/${reference}` as const,
  },
} as const;
