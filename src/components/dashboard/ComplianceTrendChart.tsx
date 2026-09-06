"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendPoint } from "@/types";

/**
 * ComplianceTrendChart — Compliant vs. Non-Compliant scans over time.
 *
 * `recharts` is this chart's first consumer in the codebase — installed and
 * pinned, previously unused anywhere. `COMPONENT_SPEC.md`'s gap register
 * confirms UX4G has no chart-rendering category at all, so a real charting
 * library is the documented, sanctioned path, not a workaround.
 *
 * 02-dashboard.md §5 says "chart colors come from data-viz role tokens" —
 * checked against the compiled stylesheet and confirmed no such token family
 * exists in ux4g-web-components@2.0.1. This uses the real status/brand
 * `--ux4g-bg-*` tokens instead (success for Compliant, error for
 * Non-Compliant, primary for the total-volume overlay), which are exactly the
 * ones `StatusBadge` already keys off for the same statuses elsewhere in the
 * product.
 *
 * SVG fill/stroke attributes cannot take a CSS custom property directly in
 * every renderer recharts targets, and reading it once via `getComputedStyle`
 * is also what keeps this "theme-correct in Dark mode" per the DashboardPanel
 * recipe: if the token's resolved value changes with the theme, a live read
 * picks that up rather than baking in whichever value happened to be current
 * at build time.
 */

export interface ComplianceTrendChartProps {
  data: readonly TrendPoint[];
  /** Localised legend/axis labels — never hardcoded English in this component. */
  labels: {
    compliant: string;
    nonCompliant: string;
    totalScans: string;
    /** Heading for the visually-hidden fallback table's caption. */
    heading: string;
    /** Column header for the date row, e.g. "Date". */
    dateColumn: string;
  };
  /**
   * Analytics & Violation Trends' (page 7) drill-down — clicking a point on
   * the Compliant or Non-Compliant line navigates to Compliance Records
   * filtered to that bucket's date range and status. Optional and unused by
   * Dashboard's own `TrendPanel` usage, which passes nothing.
   */
  onPointClick?: (point: TrendPoint, series: "compliant" | "nonCompliant") => void;
}

interface SeriesColors {
  compliant: string;
  nonCompliant: string;
  totalScans: string;
  grid: string;
  axis: string;
  tooltipBackground: string;
  tooltipText: string;
  tooltipBorderWidth: string;
  tooltipRadius: string;
  fontSize: string;
}

/** Neutral fallback so the chart never throws if a token somehow resolves empty. */
const FALLBACK_COLORS: SeriesColors = {
  compliant: "#16a34a",
  nonCompliant: "#dc2626",
  totalScans: "#4a2bc2",
  grid: "#e5e5e5",
  axis: "#737373",
  tooltipBackground: "#ffffff",
  tooltipText: "#171717",
  tooltipBorderWidth: "1px",
  tooltipRadius: "8px",
  fontSize: "12px",
};

function readSeriesColors(root: HTMLElement): SeriesColors {
  const style = getComputedStyle(root);
  const read = (token: string, fallback: string) => {
    const value = style.getPropertyValue(token).trim();
    return value || fallback;
  };

  return {
    compliant: read("--ux4g-bg-success-strong", FALLBACK_COLORS.compliant),
    nonCompliant: read("--ux4g-bg-error-strong", FALLBACK_COLORS.nonCompliant),
    totalScans: read("--ux4g-bg-primary-strong", FALLBACK_COLORS.totalScans),
    grid: read("--ux4g-border-color-neutral-subtle", FALLBACK_COLORS.grid),
    axis: read("--ux4g-text-neutral-secondary", FALLBACK_COLORS.axis),
    /*
     * recharts' Tooltip defaults to a hardcoded white box regardless of theme,
     * which read as a stark white card on the dark theme's black background —
     * caught by actually looking at the dark-mode screenshot, not by reasoning
     * about the code. Reading these two tokens keeps the tooltip in step with
     * whichever theme is active.
     */
    tooltipBackground: read(
      "--ux4g-bg-neutral-elevated",
      FALLBACK_COLORS.tooltipBackground
    ),
    tooltipText: read("--ux4g-text-neutral-primary", FALLBACK_COLORS.tooltipText),
    /*
     * Border width, radius and tick/tooltip/legend font size all have real
     * UX4G tokens too — read live for the same theme-correctness reason as
     * the colours above, rather than left as the bare numbers recharts
     * defaults its inline styles to.
     */
    tooltipBorderWidth: read("--ux4g-border-thin", FALLBACK_COLORS.tooltipBorderWidth),
    tooltipRadius: read("--ux4g-radius-md", FALLBACK_COLORS.tooltipRadius),
    fontSize: read("--ux4g-fs-12", FALLBACK_COLORS.fontSize),
  };
}

/** A clickable active dot — recharts' plain `activeDot={{ onClick }}` object form doesn't pass the point's own data through, so this render-prop form is needed to reach `payload` at all. */
function clickableDot(color: string, onClick: (point: TrendPoint) => void) {
  function ClickableDot(props: {
    cx?: number | undefined;
    cy?: number | undefined;
    payload?: TrendPoint | undefined;
  }) {
    return (
      <circle
        key={`${props.cx}-${props.cy}`}
        cx={props.cx}
        cy={props.cy}
        r={4}
        fill={color}
        style={{ cursor: "pointer" }}
        onClick={() => props.payload && onClick(props.payload)}
      />
    );
  }
  return ClickableDot;
}

export function ComplianceTrendChart({
  data,
  labels,
  onPointClick,
}: ComplianceTrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState<SeriesColors>(FALLBACK_COLORS);

  useEffect(() => {
    if (containerRef.current) {
      setColors(readSeriesColors(containerRef.current));
    }
  }, []);

  return (
    <div ref={containerRef} className="lmcs-chart-container">
      {/*
        recharts renders an SVG with no text-equivalent of its own — a screen
        reader user got nothing from this widget beyond its heading, confirmed
        by reading the accessibility tree directly (screenshots can't surface
        this). The chart itself is hidden from assistive tech below, and a
        real `ux4g-sr-only` table carrying the same `data`/`labels` stands in
        for it, matching the "table fallback" 02-dashboard.md's component
        notes call for.
      */}
      <div aria-hidden="true" className="lmcs-chart-svg-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...data]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              stroke={colors.axis}
              tick={{ fontSize: colors.fontSize, fill: colors.axis }}
              tickLine={false}
            />
            <YAxis
              stroke={colors.axis}
              tick={{ fontSize: colors.fontSize, fill: colors.axis }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: colors.fontSize,
                borderRadius: colors.tooltipRadius,
                border: `${colors.tooltipBorderWidth} solid ${colors.grid}`,
                backgroundColor: colors.tooltipBackground,
                color: colors.tooltipText,
              }}
              labelStyle={{ color: colors.tooltipText }}
            />
            <Legend wrapperStyle={{ fontSize: colors.fontSize }} />
            <Line
              type="monotone"
              dataKey="compliant"
              name={labels.compliant}
              stroke={colors.compliant}
              strokeWidth={2}
              dot={false}
              {...(onPointClick
                ? {
                    activeDot: clickableDot(colors.compliant, (point) =>
                      onPointClick(point, "compliant")
                    ),
                  }
                : {})}
            />
            <Line
              type="monotone"
              dataKey="nonCompliant"
              name={labels.nonCompliant}
              stroke={colors.nonCompliant}
              strokeWidth={2}
              dot={false}
              {...(onPointClick
                ? {
                    activeDot: clickableDot(colors.nonCompliant, (point) =>
                      onPointClick(point, "nonCompliant")
                    ),
                  }
                : {})}
            />
            <Line
              type="monotone"
              dataKey="totalScans"
              name={labels.totalScans}
              stroke={colors.totalScans}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="ux4g-sr-only">
        <caption>{labels.heading}</caption>
        <thead>
          <tr>
            <th scope="col">{labels.dateColumn}</th>
            <th scope="col">{labels.compliant}</th>
            <th scope="col">{labels.nonCompliant}</th>
            <th scope="col">{labels.totalScans}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{point.compliant}</td>
              <td>{point.nonCompliant}</td>
              <td>{point.totalScans}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
