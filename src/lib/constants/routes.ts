/**
 * routes.ts — every route path in the application, defined once.
 *
 * Pages_Userflow/00-README.md §Build order names eleven pages. This file
 * carries the URL path for each. Import ROUTES instead of writing a string
 * literal so a path rename is one change, not eleven grepped replacements.
 *
 * None of these contain the locale prefix. next-intl's Link and redirect
 * from @/i18n/navigation prepend it automatically.
 */

export const ROUTES = {
  /** Login — standalone, no shell (page 1). */
  login: "/login",

  /** Dashboard — first authenticated page, builds the shell (page 2). */
  dashboard: "/dashboard",

  /** Scan / Upload Product (page 3). */
  scan: "/scan",

  /**
   * Declaration Extraction & Verification (page 4).
   * Needs the compliance record id that was created by page 3 or page 8.
   */
  extraction: (recordId: string) => `/extraction/${recordId}` as const,

  /** Compliance Records list (page 5). */
  records: "/records",

  /**
   * Product Compliance Detail (page 6).
   * Deep link from the Records list, a KPI card, or an alert.
   */
  recordDetail: (recordId: string) => `/records/${recordId}` as const,

  /** Analytics & Violation Trends (page 7). */
  analytics: "/analytics",

  /** E-commerce Listing Scanner — USP (page 8). */
  ecommerce: "/ecommerce",

  /** Manufacturer Compliance Scorecards — USP (page 9). */
  manufacturers: "/manufacturers",

  /** Individual Manufacturer Scorecard detail. */
  manufacturerDetail: (manufacturerId: string) =>
    `/manufacturers/${manufacturerId}` as const,

  /** Reports (page 10). */
  reports: "/reports",

  /** Profile & Settings (page 10, second tab). */
  profile: "/profile",

  /** Citizen Grievance Portal — USP, public, no shell (page 11). */
  grievance: "/grievance",
} as const;

/**
 * Navigation items shown in the authenticated sidebar.
 * Order matches Pages_Userflow/00-README.md §Build order.
 * `icon` is a Material Icon ligature from the UX4G icon font.
 */
export interface NavItem {
  readonly labelKey: string;
  readonly href: string;
  readonly icon: string;
}

export const SIDEBAR_NAV: readonly NavItem[] = [
  { labelKey: "navigation.dashboard", href: ROUTES.dashboard, icon: "dashboard" },
  { labelKey: "navigation.scanUpload", href: ROUTES.scan, icon: "document_scanner" },
  { labelKey: "navigation.complianceRecords", href: ROUTES.records, icon: "fact_check" },
  { labelKey: "navigation.analytics", href: ROUTES.analytics, icon: "monitoring" },
  { labelKey: "navigation.ecommerceScanner", href: ROUTES.ecommerce, icon: "shopping_cart" },
  { labelKey: "navigation.manufacturerScorecard", href: ROUTES.manufacturers, icon: "business" },
  { labelKey: "navigation.reportsProfile", href: ROUTES.reports, icon: "summarize" },
] as const;
