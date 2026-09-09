"use client";

import { useEffect, useState } from "react";

import { fetchDashboardData } from "@/lib/api/analytics";
import type { DashboardData } from "@/types";

import { useAuth } from "./useAuth";

/** Dashboard's one viewer-aware fetch; its widgets retain independent demo states. */
export function useDashboardData() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardData(user?.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setData(result.data);
      else setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { data, loading: !data && !error, error };
}
