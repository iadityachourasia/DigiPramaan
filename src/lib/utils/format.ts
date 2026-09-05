/**
 * format.ts — number and date formatting shared across pages.
 *
 * 02-dashboard.md §4's "Very large numbers" state asks that KPI values "format
 * sensibly (e.g. 12.4K)". `Intl.NumberFormat`'s compact notation does exactly
 * this and is locale-aware for free, which matters once Hindi numerals are in
 * play — a hand-rolled "divide by 1000 and append K" helper would not be.
 */

/**
 * Format a count compactly: 850 stays "850", 12400 becomes "12.4K".
 *
 * `locale` defaults to English digits. Pass the active next-intl locale when
 * calling from a component so Hindi renders Hindi-appropriate grouping — the
 * function takes it as a parameter rather than reading a global so it stays
 * usable from both server and client code without a hook.
 */
export function formatCompactNumber(value: number, locale = "en"): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Format a signed percentage delta with an explicit sign: 12 -> "+12%", -3 ->
 * "-3%". The sign is always shown, including for zero ("+0%"), so the value
 * never reads as ambiguous about direction — the text itself carries the
 * meaning the KPI cards are required to convey without colour or an arrow.
 */
export function formatSignedPercentage(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value}%`;
}

/**
 * Format an ISO 8601 timestamp as a short date, e.g. "5 Sep 2026".
 *
 * Every record timestamp in the mock data carries a real `+05:30` offset, so
 * this always renders the calendar date the scan actually happened on for an
 * Asia/Kolkata user, not a UTC-shifted date that reads as the wrong day.
 */
export function formatShortDate(iso: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
