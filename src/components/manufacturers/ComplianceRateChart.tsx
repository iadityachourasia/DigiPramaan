"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  FALLBACK_COMMON_CHART_TOKENS,
  readCommonChartTokens,
  readToken,
  tooltipStyle,
  type CommonChartTokens,
} from "@/lib/utils/chartTheme";
import type { ComplianceRatePoint } from "@/types";

/**
 * ComplianceRateChart — one manufacturer's compliance rate over their own
 * scans (09 §3).
 *
 * A new chart rather than a reuse, for a real reason: `ComplianceTrendChart`
 * plots `TrendPoint` (three absolute counts against a shared date axis) and
 * `TrendPanel` sources its own data from `getTrendForPeriod()` with no scope
 * argument at all. This series is `ComplianceRatePoint` — one cumulative
 * percentage per scan, each carrying its `sampleSize`. Bending either
 * existing component to a percentage-plus-sample-size series would cost more
 * than this file does.
 *
 * The percentage axis is pinned to 0–100. A rate chart that auto-scaled to
 * its own range would make a 91%-to-94% wobble look like a collapse.
 */

export interface ComplianceRateChartProps {
  data: readonly ComplianceRatePoint[];
  labels: {
    heading: string;
    dateColumn: string;
    rateColumn: string;
    sampleSizeColumn: string;
  };
}

interface RateChartTokens extends CommonChartTokens {
  line: string;
}

export function ComplianceRateChart({ data, labels }: ComplianceRateChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tokens, setTokens] = useState<RateChartTokens>({
    ...FALLBACK_COMMON_CHART_TOKENS,
    line: "#16a34a",
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const root = containerRef.current;
    setTokens({
      ...readCommonChartTokens(root),
      line: readToken(root, "--ux4g-bg-success-strong", "#16a34a"),
    });
  }, []);

  const { contentStyle, labelStyle } = tooltipStyle(tokens);

  return (
    <div ref={containerRef} className="lmcs-chart-container">
      {/* Same pattern as every other chart here: the SVG carries no text
          equivalent, so it's hidden from assistive tech and the sr-only
          table below is the real accessible representation. */}
      <div aria-hidden="true" className="lmcs-chart-svg-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...data]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={tokens.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              stroke={tokens.axis}
              tick={{ fontSize: tokens.fontSize, fill: tokens.axis }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              stroke={tokens.axis}
              tick={{ fontSize: tokens.fontSize, fill: tokens.axis }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip
              contentStyle={contentStyle}
              labelStyle={labelStyle}
              formatter={(value) => `${String(value)}%`}
            />
            <Line
              type="monotone"
              dataKey="ratePercentage"
              name={labels.rateColumn}
              stroke={tokens.line}
              strokeWidth={2}
              /* Points are per-scan and sparse — unlike the dashboard trend,
                 each one is a real event worth marking. */
              dot={{ r: 3, fill: tokens.line }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* The sr-only class sits on a wrapper div, not the table itself: a table's
          used width is driven by its content, so `width: 1px` does not actually
          constrain it and the hidden table pushed the whole page into horizontal
          scroll on a 375px screen. A div honours the width and clips it. */}
      <div className="ux4g-sr-only">
        <table>
          <caption>{labels.heading}</caption>
          <thead>
            <tr>
              <th scope="col">{labels.dateColumn}</th>
              <th scope="col">{labels.rateColumn}</th>
              <th scope="col">{labels.sampleSizeColumn}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={`${point.date}-${point.sampleSize}`}>
                <th scope="row">{point.date}</th>
                <td>{point.ratePercentage}%</td>
                <td>{point.sampleSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
