import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";

/**
 * MetricCard — a KPI summary card.
 *
 * `COMPONENT_SPEC.md` §3 describes this as a *composition*, not a real UX4G
 * component: `ux4g-card` at a consistent elevation, then label → value →
 * delta, with the value the loudest element by a wide margin. No such
 * component exists to import — confirmed across the whole `src/` tree and the
 * shipped stylesheet — so this is that composition, built once and reused
 * everywhere a metric card appears (Dashboard now; Analytics and the
 * Manufacturer Scorecard next).
 *
 * `deltaDirection` drives the colour, but the direction is never colour-only:
 * `deltaLabel` is always visible text (e.g. "+12% vs last week"), which is
 * what 02-dashboard.md §2 and A-10 both require instead of an arrow or a bare
 * coloured number.
 */

export interface MetricCardProps {
  label: string;
  /** Already formatted for display, e.g. "1,234" or "12.4K". */
  value: string;
  /** Full sentence, e.g. "+12% vs last week". Always rendered as visible text. */
  deltaLabel?: string;
  deltaDirection?: "up" | "down" | "neutral";
  /**
   * Secondary line under the value, e.g. "Awaiting verification" on the
   * Pending KPI (02-dashboard.md §2's requirement that Pending's meaning be
   * explicit, not a generic backlog number). Deliberately static text rather
   * than a hover-only tooltip, which a touch-only field officer cannot trigger.
   */
  caption?: string;
  /** When present, the whole card becomes one link — never a nested control. */
  href?: string;
  icon?: ReactNode;
}

const DELTA_CLASS: Record<NonNullable<MetricCardProps["deltaDirection"]>, string> = {
  up: "ux4g-text-success",
  down: "ux4g-text-error",
  neutral: "ux4g-text-neutral-secondary",
};

const DELTA_ICON: Record<NonNullable<MetricCardProps["deltaDirection"]>, string> = {
  up: "trending_up",
  down: "trending_down",
  neutral: "trending_flat",
};

function MetricCardContent({
  label,
  value,
  deltaLabel,
  deltaDirection = "neutral",
  caption,
}: Omit<MetricCardProps, "href" | "icon">) {
  return (
    <div className="ux4g-card-body lmcs-metric-card">
      <span className="ux4g-label-l-default ux4g-text-neutral-secondary">
        {label}
      </span>
      <span className="ux4g-heading-l-strong">{value}</span>
      {caption ? (
        <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {caption}
        </span>
      ) : null}
      {deltaLabel ? (
        <span
          className={`lmcs-metric-card-delta ux4g-body-s-default ${DELTA_CLASS[deltaDirection]}`}
        >
          {/*
            The icon reinforces direction for a sighted user scanning quickly;
            deltaLabel's own wording ("+12%", "-3%") is what actually carries
            the meaning, so a screen reader loses nothing with the icon hidden.
          */}
          <span className="ux4g-icon-outlined" aria-hidden="true">
            {DELTA_ICON[deltaDirection]}
          </span>
          {deltaLabel}
        </span>
      ) : null}
    </div>
  );
}

export function MetricCard(props: MetricCardProps) {
  const { href } = props;

  if (href) {
    return (
      <Link
        href={href}
        className="ux4g-card ux4g-card-outline lmcs-metric-card-link"
      >
        <MetricCardContent {...props} />
      </Link>
    );
  }

  return (
    <div className="ux4g-card ux4g-card-outline">
      <MetricCardContent {...props} />
    </div>
  );
}
