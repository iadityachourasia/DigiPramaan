"use client";

import { useEffect } from "react";

/**
 * UX4GRuntime — boots the UX4G vendor JavaScript exactly once.
 *
 * WHY THIS EXISTS
 * ---------------
 * The project imported only `ux4g-web-components/styles.css`, never the
 * package's `runtime` entry point. Every runtime-driven component in the
 * package was therefore inert: Drawer, Modal, Dropdown, Combobox, Accordion,
 * Tab, Carousel, Tooltip, Popover and Mega Menu all rely on that vendor script
 * for their behaviour and ship no fallback. Nothing had needed one yet, which
 * is why it went unnoticed — but the Records filters, the Extraction page's
 * tabs and the mobile navigation drawer all do.
 *
 * `initRuntime()` is SSR-safe (it no-ops without `window`) and guards itself
 * against double-injection via `window.__UX4G_RUNTIME_INITIALIZED__`, so
 * mounting this once at the root is the whole integration. The vendor script
 * runs a MutationObserver, so components added later still initialise.
 *
 * Renders nothing.
 */
export function UX4GRuntime() {
  useEffect(() => {
    /*
     * Imported dynamically rather than at module scope so the vendor bundle
     * stays out of the server graph and off the initial payload.
     */
    let cancelled = false;

    void import("ux4g-web-components/runtime").then(({ initRuntime }) => {
      if (!cancelled) initRuntime();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
