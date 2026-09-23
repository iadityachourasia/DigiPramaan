/**
 * admin.ts — Admin Console API client (page 12).
 *
 * §AF (2026-09-20): real branch added, calling backend/app/api/v1/admin.py
 * (GET /admin/team, GET/PUT /admin/thresholds, POST /admin/users/{id}/
 * deactivate, POST /admin/cases/reassign). Identity is the Bearer token
 * only in real mode — `viewerId`/`actorId` params are accepted (unchanged
 * signature, so AdminConsoleView.tsx needs no changes) but ignored, same
 * discipline every other real client module in this app already follows.
 * Every function keeps its existing throw-on-failure contract so callers
 * don't need to branch on an ApiResult.
 */

import { API } from "@/lib/constants";
import type { ManagedUser, RuleThresholds, Role } from "@/types";
import { apiGet, apiPost, apiPut, isMockMode } from "./client";

export interface CreateUserInput {
  email: string;
  username: string;
  fullName: string;
  password: string;
  role: Role;
  department: string;
  region: string;
  jurisdictionLevel: "State" | "National";
  jurisdictionName: string;
}

interface AdminTeamResponse { users: ManagedUser[]; }

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

async function unwrap<T>(result: Awaited<ReturnType<typeof apiGet<T>>>): Promise<T> {
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

export function fetchAdminTeam(viewerId: string) {
  if (!isMockMode()) return apiGet<AdminTeamResponse>(API.admin.team).then(unwrap);
  return request<AdminTeamResponse>(`/api/admin/team?viewerId=${encodeURIComponent(viewerId)}`);
}
export function fetchRuleThresholds(viewerId: string) {
  if (!isMockMode()) return apiGet<RuleThresholds>(API.admin.thresholds).then(unwrap);
  return request<RuleThresholds>(`/api/admin/thresholds?viewerId=${encodeURIComponent(viewerId)}`);
}
export function saveRuleThresholds(actorId: string, thresholds: RuleThresholds) {
  if (!isMockMode()) return apiPut<RuleThresholds>(API.admin.thresholds, thresholds).then(unwrap);
  return request<RuleThresholds>("/api/admin/thresholds", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId, thresholds }) });
}
export function deactivateAdminUser(actorId: string, userId: string) {
  if (!isMockMode()) {
    return apiPost<ManagedUser>(API.admin.deactivateUser(userId), {}).then(unwrap);
  }
  return request<ManagedUser>(`/api/admin/users/${encodeURIComponent(userId)}/deactivate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId }) });
}
export function createAdminUser(actorId: string, input: CreateUserInput) {
  if (!isMockMode()) return apiPost<ManagedUser>(API.admin.createUser, input).then(unwrap);
  return request<ManagedUser>("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId, ...input }) });
}
export function reassignAdminCase(actorId: string, recordId: string, newOfficerUserId: string) {
  if (!isMockMode()) {
    return apiPost<{ status: string }>(API.admin.reassignCase, { recordId, newOfficerUserId })
      .then(unwrap)
      .then(() => undefined);
  }
  return request<void>("/api/admin/reassign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId, recordId, newOfficerUserId }) });
}
