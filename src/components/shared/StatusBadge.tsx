import type { ComplianceStatus } from "@/types";

/**
 * StatusBadge — the compliance status pill used on 6+ pages.
 *
 * Maps each ComplianceStatus to a UX4G status class. The badge always
 * carries both a coloured indicator AND visible text, so nothing depends
 * on colour alone (A-10 / WCAG 1.4.1).
 *
 * 00-README.md §D forbids paraphrasing these values. The rendered text
 * comes from the i18n layer; the constant here is only for the CSS class.
 */

const STATUS_CLASS: Record<ComplianceStatus, string> = {
  Pending: "ux4g-status-info",
  Compliant: "ux4g-status-success",
  "Non-Compliant": "ux4g-status-error",
  "Needs Review": "ux4g-status-warning",
};

const STATUS_ICON: Record<ComplianceStatus, string> = {
  Pending: "schedule",
  Compliant: "check_circle",
  "Non-Compliant": "cancel",
  "Needs Review": "flag",
};

export interface StatusBadgeProps {
  status: ComplianceStatus;
  /** The translated label — pass t(`vocabulary.complianceStatus.${status}`). */
  label: string;
  /** Render as compact pill (default) or full-width row. */
  variant?: "pill" | "row";
}

export function StatusBadge({
  status,
  label,
  variant = "pill",
}: StatusBadgeProps) {
  return (
    <span
      className={`${STATUS_CLASS[status]} lmcs-status-badge lmcs-status-badge-${variant}`}
    >
      <span className="ux4g-icon-outlined" aria-hidden="true">
        {STATUS_ICON[status]}
      </span>
      <span className="ux4g-label-s-default">{label}</span>
    </span>
  );
}
