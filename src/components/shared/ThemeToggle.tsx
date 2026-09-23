"use client";

import { useTranslations } from "next-intl";

import { setTheme, useTheme } from "@/lib/theme";

/** One accessible UX4G control, reused by every app shell. */
export function ThemeToggle({ variant = "text" }: { variant?: "text" | "outline" }) {
  const t = useTranslations("theme");
  const theme = useTheme();
  const isDark = theme === "dark";
  const action = isDark ? t("switchToLight") : t("switchToDark");

  return (
    <button
      type="button"
      className={
        variant === "outline"
          ? "ux4g-icon-btn ux4g-icon-btn-outline-primary ux4g-icon-btn-lg lmcs-theme-toggle"
          : "ux4g-btn ux4g-btn-text-neutral ux4g-btn-md lmcs-theme-toggle"
      }
      aria-label={t("darkMode")}
      aria-pressed={isDark}
      title={action}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span className="ux4g-icon-outlined" aria-hidden="true">
        {isDark ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}
