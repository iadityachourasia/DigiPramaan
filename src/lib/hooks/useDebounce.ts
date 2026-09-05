"use client";

import { useEffect, useState } from "react";

/**
 * useDebounce — delay a value update until typing pauses.
 *
 * Used on search inputs (Compliance Records, Manufacturer Scorecard) so the
 * filter does not fire on every keystroke. 300 ms is the default; 03 §2 and
 * 05 §2 both reference a "search as you type" input that should feel
 * responsive but not wasteful.
 */
export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
