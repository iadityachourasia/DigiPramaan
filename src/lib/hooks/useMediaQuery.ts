"use client";

import { useEffect, useState } from "react";

/**
 * useMediaQuery — subscribe to a CSS media query.
 *
 * DESIGN_SYSTEM.md §8 defines three breakpoint ranges:
 *   Mobile    0 – 1023 px
 *   Tablet    1024 – 1439 px
 *   Desktop   1440 px +
 *
 * Use the helpers below rather than writing the query inline.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    function onChange(event: MediaQueryListEvent) {
      setMatches(event.matches);
    }

    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [query]);

  return matches;
}

/** True on viewports at or above the tablet breakpoint (1024 px). */
export function useIsTabletOrAbove(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

/** True on viewports at or above the desktop breakpoint (1440 px). */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1440px)");
}

/** True when the user prefers reduced motion (WCAG 2.3.3 / A-03). */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
