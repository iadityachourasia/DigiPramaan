"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePathname } from "@/i18n/navigation";
import { fetchUnreadNotificationCount } from "@/lib/api/notifications";
import { useAuth } from "./useAuth";

/** Matches useScanPipeline's own polling cadence conventions — cheap
 * enough (a single COUNT query) to poll this often without concern. */
const POLL_INTERVAL_MS = 30_000;

/**
 * useUnreadNotificationCount — the single source of truth for the header
 * bell's badge AND its dropdown, so the two can never disagree. Polls on an
 * interval and refetches on route change; callers that just mutated
 * read-state (mark-one-read, mark-all-read) call `refresh()` for immediate
 * consistency instead of waiting for the next tick.
 */
export function useUnreadNotificationCount() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    if (!user) return;
    fetchUnreadNotificationCount().then((result) => {
      if (cancelledRef.current) return;
      if (result.ok) setCount(result.data.unreadCount);
    });
  }, [user]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
    // Re-run on route change too — landing back on an authenticated page
    // after being signed out/in elsewhere shouldn't wait a full interval.
  }, [refresh, pathname]);

  return { count, refresh };
}
