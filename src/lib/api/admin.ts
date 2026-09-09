import type { ManagedUser, RuleThresholds } from "@/types";

interface AdminTeamResponse { users: ManagedUser[]; }

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

export function fetchAdminTeam(viewerId: string) {
  return request<AdminTeamResponse>(`/api/admin/team?viewerId=${encodeURIComponent(viewerId)}`);
}
export function fetchRuleThresholds(viewerId: string) {
  return request<RuleThresholds>(`/api/admin/thresholds?viewerId=${encodeURIComponent(viewerId)}`);
}
export function saveRuleThresholds(actorId: string, thresholds: RuleThresholds) {
  return request<RuleThresholds>("/api/admin/thresholds", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId, thresholds }) });
}
export function deactivateAdminUser(actorId: string, userId: string) {
  return request<ManagedUser>(`/api/admin/users/${encodeURIComponent(userId)}/deactivate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId }) });
}
export function reassignAdminCase(actorId: string, recordId: string, newOfficerUserId: string) {
  return request<void>("/api/admin/reassign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId, recordId, newOfficerUserId }) });
}
