import { describe, expect, it } from "vitest";

import {
  formatCompactNumber,
  formatShortDate,
  formatSignedPercentage,
} from "@/lib/utils/format";

/**
 * 02-dashboard.md §4's "Very large numbers" state asks that KPI values
 * "format sensibly (e.g. 12.4K)". The real Dashboard's mock data never
 * reaches that size (11 active records), so this is verified here directly
 * against a large input rather than by inflating the dashboard's own numbers
 * to manufacture a screenshot — the seeded data stays honest about what it
 * actually represents.
 */

describe("formatCompactNumber", () => {
  it("leaves small counts untouched", () => {
    expect(formatCompactNumber(850)).toBe("850");
  });

  it("formats large counts compactly", () => {
    expect(formatCompactNumber(12400)).toBe("12.4K");
  });

  it("formats zero as a plain zero, not blank", () => {
    expect(formatCompactNumber(0)).toBe("0");
  });
});

describe("formatSignedPercentage", () => {
  it("always shows an explicit sign, including for a positive value", () => {
    expect(formatSignedPercentage(12)).toBe("+12%");
  });

  it("keeps the minus sign for a negative value", () => {
    expect(formatSignedPercentage(-3)).toBe("-3%");
  });

  it("signs zero as positive rather than leaving it ambiguous", () => {
    expect(formatSignedPercentage(0)).toBe("+0%");
  });
});

describe("formatShortDate", () => {
  it("renders the Asia/Kolkata calendar date, not a UTC-shifted one", () => {
    /*
     * 23:30 UTC on 4 Sep is already 5 Sep in Asia/Kolkata (+05:30). A naive
     * formatter using the reader's local time zone could show either date
     * depending on where it runs; this must always show 5 Sep.
     */
    expect(formatShortDate("2026-09-04T23:30:00Z")).toBe("Sep 5, 2026");
  });
});
