"use client";

import { useEffect } from "react";

import { observeThemePreferences } from "@/lib/theme";

/** Keeps the active theme in sync with storage changes from other tabs. */
export function ThemeRuntime() {
  useEffect(() => observeThemePreferences(), []);
  return null;
}
