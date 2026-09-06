/**
 * chartTheme.ts — shared live-token-reading helpers for every recharts
 * instance in this app (Analytics & Violation Trends, page 7, is the first
 * page with more than one chart, so this factors out
 * `ComplianceTrendChart.tsx`'s own established pattern rather than
 * re-implementing `getComputedStyle` reads three times).
 *
 * No `--ux4g-chart-*`/`--ux4g-dataviz-*` token family exists in the
 * compiled stylesheet (confirmed by grep) — every chart reads the same
 * real semantic/status tokens `StatusBadge` already keys off, live via
 * `getComputedStyle` (not baked in at build time, so a theme change is
 * picked up), with a neutral hex fallback only if a token somehow resolves
 * empty.
 */

export interface CommonChartTokens {
  grid: string;
  axis: string;
  tooltipBackground: string;
  tooltipText: string;
  tooltipBorderWidth: string;
  tooltipRadius: string;
  fontSize: string;
}

export const FALLBACK_COMMON_CHART_TOKENS: CommonChartTokens = {
  grid: "#e5e5e5",
  axis: "#737373",
  tooltipBackground: "#ffffff",
  tooltipText: "#171717",
  tooltipBorderWidth: "1px",
  tooltipRadius: "8px",
  fontSize: "12px",
};

/** Reads one custom property off `root`, falling back if it resolves empty. */
export function readToken(root: HTMLElement, token: string, fallback: string): string {
  const value = getComputedStyle(root).getPropertyValue(token).trim();
  return value || fallback;
}

export function readCommonChartTokens(root: HTMLElement): CommonChartTokens {
  return {
    grid: readToken(root, "--ux4g-border-color-neutral-subtle", FALLBACK_COMMON_CHART_TOKENS.grid),
    axis: readToken(root, "--ux4g-text-neutral-secondary", FALLBACK_COMMON_CHART_TOKENS.axis),
    tooltipBackground: readToken(
      root,
      "--ux4g-bg-neutral-elevated",
      FALLBACK_COMMON_CHART_TOKENS.tooltipBackground
    ),
    tooltipText: readToken(
      root,
      "--ux4g-text-neutral-primary",
      FALLBACK_COMMON_CHART_TOKENS.tooltipText
    ),
    tooltipBorderWidth: readToken(
      root,
      "--ux4g-border-thin",
      FALLBACK_COMMON_CHART_TOKENS.tooltipBorderWidth
    ),
    tooltipRadius: readToken(root, "--ux4g-radius-md", FALLBACK_COMMON_CHART_TOKENS.tooltipRadius),
    fontSize: readToken(root, "--ux4g-fs-12", FALLBACK_COMMON_CHART_TOKENS.fontSize),
  };
}

/** Recharts' `Tooltip.contentStyle`/`labelStyle`, built once from the common tokens. */
export function tooltipStyle(tokens: CommonChartTokens) {
  return {
    contentStyle: {
      fontSize: tokens.fontSize,
      borderRadius: tokens.tooltipRadius,
      border: `${tokens.tooltipBorderWidth} solid ${tokens.grid}`,
      backgroundColor: tokens.tooltipBackground,
      color: tokens.tooltipText,
    },
    labelStyle: { color: tokens.tooltipText },
  };
}
