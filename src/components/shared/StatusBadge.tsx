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

/*
 * FIXED: this previously mapped to `ux4g-status-{info,success,error,warning}`.
 * Those classes exist in the compiled stylesheet but only ever apply colour
 * when combined with `.ux4g-table-input`/`.ux4g-table-select` (a form
 * control's border colour) — confirmed by reading every rule that mentions
 * them. Used standalone, as this badge did, they set nothing: every status
 * pill on every page using this component rendered in plain neutral text,
 * silently. `ux4g-tag-tonal-*` is the real, general-purpose status-coloured
 * class — already verified working on the landing page's declaration
 * verdicts — and its own rule sets both background and text colour.
 */
const STATUS_CLASS: Record<ComplianceStatus, string> = {
  Pending: "ux4g-tag-tonal-info",
  Compliant: "ux4g-tag-tonal-success",
  "Non-Compliant": "ux4g-tag-tonal-error",
  "Needs Review": "ux4g-tag-tonal-warning",
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
      className={`${STATUS_CLASS[status]} ux4g-tag-s lmcs-status-badge lmcs-status-badge-${variant}`}
    >
      <span className="ux4g-icon-outlined" aria-hidden="true">
        {STATUS_ICON[status]}
      </span>
      <span className="ux4g-label-s-default">{label}</span>
    </span>
  );
}
