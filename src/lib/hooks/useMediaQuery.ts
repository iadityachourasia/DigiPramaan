"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * useMediaQuery — subscribe to a CSS media query.
 *
 * DESIGN_SYSTEM.md §8 defines three breakpoint ranges:
 *   Mobile    0 – 1023 px
 *   Tablet    1024 – 1439 px
 *   Desktop   1440 px +
 *
 * Use the helpers below rather than writing the query inline.
 *
 * Implemented with `useSyncExternalStore` rather than `useState` plus an effect.
 * A `MediaQueryList` is an external store, and reading one by calling `setState`
 * inside an effect causes a cascading render on every mount — which is what the
 * `react-hooks/set-state-in-effect` rule is pointing at. This version reads the
 * store during render instead, so the first paint already has the right answer
 * on the client and there is no second render.
 *
 * `getServerSnapshot` returns false so server output matches the pre-hydration
 * client. Any layout that must differ by viewport should be driven by CSS media
 * queries, not by this hook, precisely because the server cannot know the width.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onStoreChange);
      return () => {
        media.removeEventListener("change", onStoreChange);
      };
    },
    [query]
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
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
