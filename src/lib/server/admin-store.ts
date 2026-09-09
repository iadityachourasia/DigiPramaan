import { findJurisdiction, regionNamesVisibleTo } from "@/lib/mock/jurisdictions";
import { MOCK_USERS, findMockUser } from "@/lib/mock/users";
import type { ManagedUser, RuleThresholds, User } from "@/types";

const inactiveUserIds = new Set<string>();

let thresholds: RuleThresholds = {
  repeatViolationCount: 3,
  repeatViolationDays: 90,
  ocrConfidenceThreshold: 70,
  excellentMinimum: 90,
  goodMinimum: 70,
  poorMinimum: 40,
};

function isInAdminScope(user: User, admin: User): boolean {
  const visibleRegions = regionNamesVisibleTo(admin.jurisdictionId);
  if (visibleRegions === null) return true;
  return user.jurisdictionId === admin.jurisdictionId;
}

export function isUserActive(userId: string): boolean {
  return !inactiveUserIds.has(userId);
}

export function managedUsersForAdmin(viewerId: string, caseLoads: Map<string, number>): ManagedUser[] | undefined {
  const admin = findMockUser(viewerId);
  if (!admin || admin.role !== "Admin" || !isUserActive(admin.id)) return undefined;
  return MOCK_USERS.filter((user) => isInAdminScope(user, admin)).map((user) => ({
    ...user,
    active: isUserActive(user.id),
    caseLoad: caseLoads.get(user.id) ?? 0,
    jurisdictionName: findJurisdiction(user.jurisdictionId)?.name ?? user.jurisdictionId,
  }));
}

export function deactivateManagedUser(userId: string, actorId: string): { user?: User; error?: string } {
  const actor = findMockUser(actorId);
  const user = findMockUser(userId);
  if (!actor || actor.role !== "Admin" || !user || !isUserActive(actorId)) return { error: "Not permitted" };
  if (user.id === actor.id) return { error: "You cannot deactivate your own account." };
  if (!isInAdminScope(user, actor)) return { error: "User is outside your jurisdiction." };
  const activeAdmins = MOCK_USERS.filter((candidate) => candidate.role === "Admin" && candidate.jurisdictionId === user.jurisdictionId && isUserActive(candidate.id));
  if (user.role === "Admin" && activeAdmins.length <= 1) return { error: "Each jurisdiction must retain one active Admin." };
  inactiveUserIds.add(user.id);
  return { user: { ...user, active: false } };
}

export function getRuleThresholds(): RuleThresholds { return { ...thresholds }; }

export function updateRuleThresholds(next: RuleThresholds): RuleThresholds | undefined {
  const integers = Object.values(next).every((value) => Number.isInteger(value));
  if (!integers || next.repeatViolationCount < 1 || next.repeatViolationDays < 1 || next.repeatViolationDays > 365 || next.ocrConfidenceThreshold < 1 || next.ocrConfidenceThreshold > 100 || next.excellentMinimum > 100 || next.poorMinimum < 0 || !(next.excellentMinimum > next.goodMinimum && next.goodMinimum > next.poorMinimum)) return undefined;
  thresholds = { ...next };
  return getRuleThresholds();
}

export function resetAdminStoreForTests() {
  inactiveUserIds.clear();
  thresholds = { repeatViolationCount: 3, repeatViolationDays: 90, ocrConfidenceThreshold: 70, excellentMinimum: 90, goodMinimum: 70, poorMinimum: 40 };
}
