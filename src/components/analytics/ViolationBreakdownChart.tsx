"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import {
  violationCategory,
  type ViolationBreakdownEntry,
  type ViolationCategoryId,
} from "@/types";

/**
 * ViolationBreakdownChart — the 10-category Canonical Violation Taxonomy
 * breakdown (07-analytics-violation-trends.md §2). A ranked horizontal bar,
 * not a donut: ten slices in a donut is illegible (ten colours, long
 * category names crammed into a legend), while a horizontal bar keeps the
 * full taxonomy wording as row labels — still satisfies the spec's own
 * "donut or bar" either/or. Every bar drills into Compliance Records
 * filtered to that category.
 */

export interface ViolationBreakdownChartProps {
  data: readonly ViolationBreakdownEntry[];
  onBarClick: (categoryId: ViolationCategoryId) => void;
  labels: {
    heading: string;
    countColumn: string;
    categoryColumn: string;
  };
}

interface Row {
  categoryId: ViolationCategoryId;
  category: string;
  count: number;
}

export function ViolationBreakdownChart({
  data,
  onBarClick,
  labels,
}: ViolationBreakdownChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tokens, setTokens] = useState<CommonChartTokens>(FALLBACK_COMMON_CHART_TOKENS);
  const [barColor, setBarColor] = useState(FALLBACK_COMMON_CHART_TOKENS.grid);

  useEffect(() => {
    if (!containerRef.current) return;
    setTokens(readCommonChartTokens(containerRef.current));
    setBarColor(readToken(containerRef.current, "--ux4g-bg-error-strong", "#dc2626"));
  }, []);

  const rows: Row[] = [...data]
    .map((entry) => ({
      categoryId: entry.categoryId,
      category: violationCategory(entry.categoryId).category,
      count: entry.count,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div ref={containerRef} className="lmcs-chart-container lmcs-chart-container-tall">
      <div aria-hidden="true" className="lmcs-chart-svg-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid
              stroke={tokens.grid}
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis
              type="number"
              stroke={tokens.axis}
              tick={{ fontSize: tokens.fontSize, fill: tokens.axis }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="category"
              width={220}
              stroke={tokens.axis}
              tick={{ fontSize: tokens.fontSize, fill: tokens.axis }}
              tickLine={false}
            />
            <Tooltip
              {...tooltipStyle(tokens)}
              formatter={(value) => [value, labels.countColumn]}
            />
            <Bar
              dataKey="count"
              fill={barColor}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              {rows.map((row) => (
                <Cell
                  key={row.categoryId}
                  cursor="pointer"
                  onClick={() => onBarClick(row.categoryId)}
                />
              ))}
            </Bar>
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
              <th scope="col">{labels.countColumn}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.categoryId}>
                <th scope="row">{row.category}</th>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
