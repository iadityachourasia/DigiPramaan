"use client";

import { useEffect } from "react";

import { observeThemePreferences } from "@/lib/theme";

/** Keeps the active theme in sync with storage and operating-system changes. */
export function ThemeRuntime() {
  useEffect(() => observeThemePreferences(), []);
  return null;
}
