/**
 * notifications.ts — Notifications & Alerts API client.
 *
 * Real FastAPI backend only (backend/app/api/v1/notifications.py) — a
 * brand-new feature with no mock equivalent to keep in step, same
 * precedent as productDna.ts/cases.ts/explanations.ts. Every function goes
 * straight through client.ts's apiGet/apiPost (Bearer token), never
 * isMockMode()-branched.
 */

import { API } from "@/lib/constants";
import type { NotificationEntry, NotificationFilters, NotificationPage } from "@/types";
import { apiGet, apiPost } from "./client";
import type { ApiResult } from "./client";

/**
 * Builds the query string GET /notifications expects. `types` repeats the
 * key (`?type=a&type=b`), matching the same `URLSearchParams.getAll()`
 * convention Activity Log's own `buildActivityQuery()` established.
 */
export function buildNotificationsQuery(
  filters: NotificationFilters,
  page: number,
  pageSize: number
): string {
  const params = new URLSearchParams();

  if (filters.read !== undefined) params.set("read", String(filters.read));
  for (const type of filters.types) params.append("type", type);

  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  return params.toString();
}

export function fetchNotifications(
  filters: NotificationFilters,
  page: number,
  pageSize: number
): Promise<ApiResult<NotificationPage>> {
  const query = buildNotificationsQuery(filters, page, pageSize);
  return apiGet<NotificationPage>(`${API.notifications.list}?${query}`);
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export function fetchUnreadNotificationCount(): Promise<ApiResult<UnreadCountResponse>> {
  return apiGet<UnreadCountResponse>(API.notifications.unreadCount);
}

export function markNotificationRead(id: string): Promise<ApiResult<NotificationEntry>> {
  return apiPost<NotificationEntry>(API.notifications.markRead(id), {});
}

export interface MarkAllReadResponse {
  updated: number;
}

export function markAllNotificationsRead(): Promise<ApiResult<MarkAllReadResponse>> {
  return apiPost<MarkAllReadResponse>(API.notifications.markAllRead, {});
}
