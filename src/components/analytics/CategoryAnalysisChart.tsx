"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import type {
  CategoryBreakdownEntry,
  ComplianceStatus,
  ProductCategory,
} from "@/types";

/**
 * CategoryAnalysisChart — violations by product category
 * (07-analytics-violation-trends.md §2). Grouped vertical bars, Compliant
 * vs. Non-Compliant per category, reusing the exact same
 * `--ux4g-bg-success-strong`/`--ux4g-bg-error-strong` tokens
 * `ComplianceTrendChart` already established for the same two statuses.
 */

export interface CategoryAnalysisChartProps {
  data: readonly CategoryBreakdownEntry[];
  onBarClick: (category: ProductCategory, status: ComplianceStatus) => void;
  labels: {
    heading: string;
    categoryColumn: string;
    compliantSeries: string;
    nonCompliantSeries: string;
  };
}

export function CategoryAnalysisChart({
  data,
  onBarClick,
  labels,
}: CategoryAnalysisChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tokens, setTokens] = useState<CommonChartTokens>(FALLBACK_COMMON_CHART_TOKENS);
  const [compliantColor, setCompliantColor] = useState("#16a34a");
  const [nonCompliantColor, setNonCompliantColor] = useState("#dc2626");

  useEffect(() => {
    if (!containerRef.current) return;
    setTokens(readCommonChartTokens(containerRef.current));
    setCompliantColor(
      readToken(containerRef.current, "--ux4g-bg-success-strong", "#16a34a")
    );
    setNonCompliantColor(
      readToken(containerRef.current, "--ux4g-bg-error-strong", "#dc2626")
    );
  }, []);

  return (
    <div ref={containerRef} className="lmcs-chart-container">
      <div aria-hidden="true" className="lmcs-chart-svg-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...data]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={tokens.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="category"
              stroke={tokens.axis}
              tick={{ fontSize: tokens.fontSize, fill: tokens.axis }}
              tickLine={false}
            />
            <YAxis
              stroke={tokens.axis}
              tick={{ fontSize: tokens.fontSize, fill: tokens.axis }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip {...tooltipStyle(tokens)} />
            <Legend wrapperStyle={{ fontSize: tokens.fontSize }} />
            <Bar
              dataKey="compliant"
              name={labels.compliantSeries}
              fill={compliantColor}
              cursor="pointer"
              isAnimationActive={false}
              onClick={(item: { payload?: CategoryBreakdownEntry }) => {
                if (item.payload) onBarClick(item.payload.category, "Compliant");
              }}
            />
            <Bar
              dataKey="nonCompliant"
              name={labels.nonCompliantSeries}
              fill={nonCompliantColor}
              cursor="pointer"
              isAnimationActive={false}
              onClick={(item: { payload?: CategoryBreakdownEntry }) => {
                if (item.payload) onBarClick(item.payload.category, "Non-Compliant");
              }}
            />
          </BarChart>
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
              <th scope="col">{labels.categoryColumn}</th>
              <th scope="col">{labels.compliantSeries}</th>
              <th scope="col">{labels.nonCompliantSeries}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.category}>
                <th scope="row">{row.category}</th>
                <td>{row.compliant}</td>
                <td>{row.nonCompliant}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
