import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrendPanel } from "@/components/dashboard/TrendPanel";
import type { TrendPoint } from "@/types";

/**
 * §AF follow-up (2026-09-20): TrendPanel is shared by Dashboard and
 * Analytics & Violation Trends. Both pages' real API clients
 * (fetchDashboardData/fetchAnalyticsData) already return a real
 * `trends: {weekly, monthly}` series, but AnalyticsView previously never
 * passed it down — TrendPanel always fell back to the illustrative mock
 * series (getTrendForPeriod) regardless of mode. This locks in the fix:
 * when a real `dataByPeriod` is supplied, it must be used instead of the
 * mock fallback, for whichever page passes it.
 */

vi.mock("@/components/dashboard/ComplianceTrendChart", () => ({
  ComplianceTrendChart: ({ data }: { data: readonly TrendPoint[] }) => (
    <div data-testid="chart-data">{JSON.stringify(data)}</div>
  ),
}));

const LABELS = {
  heading: "Compliance trend",
  weekly: "Weekly",
  monthly: "Monthly",
  compliantSeries: "Compliant",
  nonCompliantSeries: "Non-Compliant",
  totalScansSeries: "Total scans",
  dateColumn: "Date",
  notEnoughData: "Not enough data",
  loading: "Loading",
  errorTitle: "Error",
  errorBody: "Something went wrong",
  retryLabel: "Retry",
};

const REAL_WEEKLY: TrendPoint[] = [
  { date: "2026-real-week-1", compliant: 5, nonCompliant: 1, totalScans: 6 },
  { date: "2026-real-week-2", compliant: 7, nonCompliant: 2, totalScans: 9 },
];
const REAL_MONTHLY: TrendPoint[] = [
  { date: "2026-real-month-1", compliant: 20, nonCompliant: 4, totalScans: 24 },
  { date: "2026-real-month-2", compliant: 25, nonCompliant: 6, totalScans: 31 },
];

describe("TrendPanel real vs. mock data", () => {
  it("renders the real weekly series when dataByPeriod is provided", () => {
    render(
      <TrendPanel
        labels={LABELS}
        dataByPeriod={{ weekly: REAL_WEEKLY, monthly: REAL_MONTHLY }}
        period="weekly"
      />
    );
    const rendered = screen.getByTestId("chart-data").textContent ?? "";
    expect(rendered).toContain("2026-real-week-1");
    expect(rendered).not.toContain("2026-07-06"); // MOCK_TREND's first date — must not leak through
  });

  it("renders the real monthly series when the period toggles, still from dataByPeriod", () => {
    render(
      <TrendPanel
        labels={LABELS}
        dataByPeriod={{ weekly: REAL_WEEKLY, monthly: REAL_MONTHLY }}
        period="monthly"
      />
    );
    const rendered = screen.getByTestId("chart-data").textContent ?? "";
    expect(rendered).toContain("2026-real-month-1");
  });

  it("falls back to the illustrative mock series when dataByPeriod is omitted (mock mode)", () => {
    render(<TrendPanel labels={LABELS} period="weekly" />);
    const rendered = screen.getByTestId("chart-data").textContent ?? "";
    expect(rendered).toContain("2026-07-06"); // MOCK_TREND's first date
  });
});
