"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@/i18n/navigation";
import { fetchNotifications } from "@/lib/api/notifications";
import { NOTIFICATION_TYPES, type NotificationPage, type NotificationType } from "@/types";

/**
 * useNotifications — the full Notifications & Alerts page's filter state and
 * data. Filter state lives in the URL, exactly as `useActivityLog` does —
 * same reasoning: a link to "what you were looking at" should just work.
 */

function typesFromParams(params: URLSearchParams): NotificationType[] {
  return params
    .getAll("type")
    .filter((type): type is NotificationType =>
      NOTIFICATION_TYPES.includes(type as NotificationType)
    );
}

function readFromParams(params: URLSearchParams): boolean | undefined {
  const raw = params.get("read");
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

export function useNotifications() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = { read: readFromParams(searchParams), types: typesFromParams(searchParams) };
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.max(1, Number(searchParams.get("pageSize")) || 20);

  const [data, setData] = useState<NotificationPage | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const searchKey = searchParams.toString();

  useEffect(() => {
    let cancelled = false;
    fetchNotifications(filters, page, pageSize).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
      setResolvedKey(searchKey);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `searchKey` is the real, primitive dependency; `filters` is a fresh object every render.
  }, [searchKey]);

  const loading = !failed && resolvedKey !== searchKey;

  function replace(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
  }

  function setReadFilter(next: boolean | undefined) {
    replace((params) => {
      if (next === undefined) params.delete("read");
      else params.set("read", String(next));
      params.delete("page");
    });
  }

  function toggleTypeFilter(type: NotificationType) {
    replace((params) => {
      const current = params.getAll("type");
      params.delete("type");
      const next = current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type];
      for (const entry of next) params.append("type", entry);
      params.delete("page");
    });
  }

  function setPage(next: number) {
    replace((params) => params.set("page", String(next)));
  }

  function clearAll() {
    router.replace(pathname, { scroll: false });
  }

  /**
   * Marks a row read locally, without a full refetch — every list mutation
   * this app already makes (e.g. RecordsView's optimistic bulk actions)
   * updates in place rather than round-tripping for a page the user is
   * actively looking at.
   */
  function markReadLocally(id: string) {
    setData((current) => {
      if (!current) return current;
      const wasUnread = current.rows.some((row) => row.id === id && !row.readAt);
      return {
        ...current,
        rows: current.rows.map((row) =>
          row.id === id && !row.readAt ? { ...row, readAt: new Date().toISOString() } : row
        ),
        unreadCount: wasUnread ? Math.max(0, current.unreadCount - 1) : current.unreadCount,
      };
    });
  }

  function markAllReadLocally() {
    setData((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => (row.readAt ? row : { ...row, readAt: new Date().toISOString() })),
            unreadCount: 0,
          }
        : current
    );
  }

  const hasActiveFilters = filters.read !== undefined || filters.types.length > 0;

  return {
    filters,
    page,
    pageSize,
    hasActiveFilters,
    data,
    loading,
    error: failed,
    setReadFilter,
    toggleTypeFilter,
    setPage,
    clearAll,
    markReadLocally,
    markAllReadLocally,
  };
}
