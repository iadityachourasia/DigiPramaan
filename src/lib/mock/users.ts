/**
 * Seeded accounts, one per role.
 *
 * BRD §15 Q-01 is answered "role assigned server-side from credentials", so the
 * Login page offers no role selector. Demonstrating all three permission sets
 * therefore means signing in as three different accounts, which is exactly what
 * these are for.
 *
 * TODO: BRD §15 Q-06 is unresolved — the real authentication method may be
 * Aadhaar-linked, departmental SSO, or plain credentials. These accounts model the
 * plain-credentials case, which 01-login.md's own field list assumes.
 *
 * The password column below is a mock fixture for a frontend with no backend. It is
 * never checked against anything real, and nothing in this file ships to production.
 */

import type { User } from "@/types";

import { NATIONAL_JURISDICTION_ID, jurisdictionIdForState } from "./jurisdictions";

export interface MockCredential {
  username: string;
  /** Fixture only. Replaced entirely by the real auth integration. */
  password: string;
  userId: string;
}

/**
 * The three original accounts stay at `National` jurisdiction — required,
 * not incidental: a National-level Admin/Reviewer's scoped visibility must
 * equal today's unscoped visibility exactly (13 §4 plan, backward
 * compatibility). `usr-004`/`usr-005` are new, `State`-level accounts added
 * specifically to exercise real narrowing without touching what the
 * original three see. Maharashtra was chosen because it already has two
 * seed records (`rec-1001`, `rec-1003`) — a genuinely narrower, non-empty,
 * non-total view is a more legible test than a state with zero or every
 * record.
 */
export const MOCK_USERS: readonly User[] = [
  {
    id: "usr-001",
    username: "r.deshmukh",
    fullName: "Rohan Deshmukh",
    email: "r.deshmukh@doca.gov.in",
    role: "Enforcement Officer",
    department: "Department of Consumer Affairs",
    region: "Maharashtra",
    jurisdictionId: NATIONAL_JURISDICTION_ID,
    lastLoginAt: "2026-09-04T09:12:00+05:30",
  },
  {
    id: "usr-002",
    username: "s.iyer",
    fullName: "Sunita Iyer",
    email: "s.iyer@doca.gov.in",
    role: "Admin",
    department: "Department of Consumer Affairs",
    region: "Delhi",
    jurisdictionId: NATIONAL_JURISDICTION_ID,
    lastLoginAt: "2026-09-05T08:40:00+05:30",
  },
  {
    id: "usr-003",
    username: "a.banerjee",
    fullName: "Arindam Banerjee",
    email: "a.banerjee@doca.gov.in",
    role: "Reviewer",
    department: "Department of Consumer Affairs",
    region: "West Bengal",
    jurisdictionId: NATIONAL_JURISDICTION_ID,
    lastLoginAt: "2026-09-03T16:05:00+05:30",
  },
  {
    id: "usr-004",
    username: "p.kulkarni",
    fullName: "Priya Kulkarni",
    email: "p.kulkarni@doca.gov.in",
    role: "Admin",
    department: "Department of Consumer Affairs",
    region: "Maharashtra",
    jurisdictionId: jurisdictionIdForState("Maharashtra"),
    lastLoginAt: "2026-09-06T11:20:00+05:30",
  },
  {
    id: "usr-005",
    username: "v.jadhav",
    fullName: "Vikram Jadhav",
    email: "v.jadhav@doca.gov.in",
    role: "Enforcement Officer",
    department: "Department of Consumer Affairs",
    region: "Maharashtra",
    jurisdictionId: jurisdictionIdForState("Maharashtra"),
    reportsToUserId: "usr-004",
    /* Deliberately owns zero seed records — see scan-pipeline-store.ts's
     * seed synthesis. An Enforcement Officer's own-cases scope has nothing
     * to show until this account scans something live, which is the
     * honest empty state, not a broken one. */
    lastLoginAt: "2026-09-07T10:00:00+05:30",
  },
];

export const MOCK_CREDENTIALS: readonly MockCredential[] = [
  { username: "r.deshmukh", password: "Demo@2026", userId: "usr-001" },
  { username: "s.iyer", password: "Demo@2026", userId: "usr-002" },
  { username: "a.banerjee", password: "Demo@2026", userId: "usr-003" },
  { username: "p.kulkarni", password: "Demo@2026", userId: "usr-004" },
  { username: "v.jadhav", password: "Demo@2026", userId: "usr-005" },
];

export function findMockUser(userId: string): User | undefined {
  return MOCK_USERS.find((user) => user.id === userId);
}

export function mockUserName(userId: string): string {
  return findMockUser(userId)?.fullName ?? "System";
}
