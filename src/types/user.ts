/**
 * user.ts — authenticated user and the Role Permission Matrix as code.
 *
 * RESOLVED, BRD §15 Q-01: role is assigned server-side from credentials. Login
 * renders no role selector; it shows a caption saying access level comes from the
 * account. This matches 01-login.md §3 step 5, where the backend returns the session
 * token together with the role, and it means the client never chooses its own
 * permissions. Sidebar and Dashboard visibility read `user.role` from the session.
 */

import type { Role } from "./vocabulary";

export interface User {
  id: string;
  /** Login identifier — 01-login.md §2 accepts a username or an email. */
  username: string;
  fullName: string;
  email: string;
  /** Assigned by the backend at authentication. Never chosen in the UI. */
  role: Role;
  department: string;
  /** Region the officer is posted to, used to default Scan/Upload metadata. */
  region: string;
  /** ISO 8601. */
  lastLoginAt: string;
}

export interface Session {
  user: User;
  /** Opaque token from the backend. Never rendered. */
  token: string;
  /** ISO 8601 expiry, drives the A-11 pre-expiry warning. */
  expiresAt: string;
}

/**
 * Every gated action in the product. One key per row of 00-README.md §C, so a
 * reviewer can diff this list against that table directly.
 */
export type Permission =
  | "scan.create"
  | "verification.confirm"
  | "record.flagNeedsReview"
  | "record.flagForEnforcement"
  | "record.archive"
  | "record.bulkStatusChange"
  | "analytics.view"
  | "rules.manageThresholds"
  | "report.generate"
  /**
   * The Global Activity Log (13 §3.2), which the spec grants to Admin and
   * Reviewer only. That shape — Admin and Reviewer without Enforcement
   * Officer — exists nowhere else in the matrix: every other row is either all
   * three roles or excludes Reviewer. `analytics.view` is the nearest
   * precedent and the one §3.2 itself invokes, but it grants all three, so
   * reusing it would put an Enforcement Officer on a page the spec restricts.
   */
  | "activity.view";

/**
 * Role Permission Matrix, verbatim from 00-README.md §C.
 *
 * Reviewer is a QA/oversight role: full read access and reporting, plus the ability
 * to escalate a case to Needs Review, but no verification or enforcement authority.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  "Enforcement Officer": [
    "scan.create",
    "verification.confirm",
    "record.flagNeedsReview",
    "record.flagForEnforcement",
    "analytics.view",
    "report.generate",
  ],
  Admin: [
    "scan.create",
    "verification.confirm",
    "record.flagNeedsReview",
    "record.flagForEnforcement",
    "record.archive",
    "record.bulkStatusChange",
    "analytics.view",
    "rules.manageThresholds",
    "report.generate",
    "activity.view",
  ],
  Reviewer: ["record.flagNeedsReview", "analytics.view", "report.generate", "activity.view"],
} as const;

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
