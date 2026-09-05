import type { Permission } from "@/types";

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

  /**
   * Statutory footer pages required of every Government of India site by
   * BRD §9.4 and GIGW 3.0. The routes are declared here so the Footer links
   * through `Link` and stays locale-aware; the pages themselves are not built
   * yet and are tracked as outstanding work.
   */
  accessibilityStatement: "/accessibility",
  privacy: "/privacy",
  terms: "/terms",
  rti: "/rti",
  help: "/help",
} as const;

/**
 * Date the site's content was last reviewed, shown in the footer per BRD §9.4
 * and GIGW 3.0.
 *
 * Deliberately a constant rather than `new Date()`. Rendering today's date would
 * claim the content was reviewed today on every single page load, which is a
 * false statement on a statutory notice. Bump this when content actually changes.
 */
export const SITE_LAST_UPDATED = "2026-09-05";

/**
 * Navigation items shown in the authenticated sidebar.
 * Order matches Pages_Userflow/00-README.md §Build order.
 * `icon` is a Material Icon ligature from the UX4G icon font.
 */
export interface NavItem {
  readonly labelKey: string;
  readonly href: string;
  readonly icon: string;
  /**
   * Permission required to see this item. Omitted means every authenticated
   * role sees it.
   *
   * Gating on a `Permission` rather than a role list keeps the Role Permission
   * Matrix in `00-README.md` §C the single source of truth: adding a role later
   * means editing `ROLE_PERMISSIONS`, not hunting through nav definitions.
   */
  readonly permission?: Permission;
}

/**
 * Sidebar navigation, gated per the Role Permission Matrix.
 *
 * Resulting visibility — Enforcement Officer 7, Admin 7, Reviewer 5:
 *
 *   Dashboard              everyone      not a matrix row; the landing surface
 *   Scan / Upload          scan.create   Reviewer cannot create scans
 *   Compliance Records     everyone      Reviewer has full read access
 *   Analytics              analytics.view
 *   E-commerce Scanner     scan.create   see the note below
 *   Manufacturer Scorecard analytics.view
 *   Reports & Profile      report.generate
 *
 * Reviewer therefore loses exactly the two entries that create scans, which is
 * precisely the boundary §C draws: full read access and reporting, plus the
 * ability to escalate, but no scanning and no verification authority.
 *
 * NOTE (inference, not a matrix row): the E-commerce Listing Scanner is gated
 * on `scan.create` because it creates compliance records, exactly as a physical
 * scan does — `00-README.md` §E describes the two as different intake routes
 * into one pipeline. The matrix does not name the page directly.
 *
 * The `analytics.view` and `report.generate` gates are satisfied by all three
 * roles today, so they hide nothing. They are declared anyway: they are the
 * correct statement of the requirement, and they cost nothing until a role
 * exists that lacks them.
 */
export const SIDEBAR_NAV: readonly NavItem[] = [
  { labelKey: "navigation.dashboard", href: ROUTES.dashboard, icon: "dashboard" },
  {
    labelKey: "navigation.scanUpload",
    href: ROUTES.scan,
    icon: "document_scanner",
    permission: "scan.create",
  },
  { labelKey: "navigation.complianceRecords", href: ROUTES.records, icon: "fact_check" },
  {
    labelKey: "navigation.analytics",
    href: ROUTES.analytics,
    icon: "bar_chart",
    permission: "analytics.view",
  },
  {
    labelKey: "navigation.ecommerceScanner",
    href: ROUTES.ecommerce,
    icon: "shopping_cart",
    permission: "scan.create",
  },
  {
    labelKey: "navigation.manufacturerScorecard",
    href: ROUTES.manufacturers,
    icon: "business",
    permission: "analytics.view",
  },
  {
    labelKey: "navigation.reportsProfile",
    href: ROUTES.reports,
    icon: "summarize",
    permission: "report.generate",
  },
] as const;
