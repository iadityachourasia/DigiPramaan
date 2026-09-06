import type { DeclarationCheck } from "@/types";

/**
 * ChecklistRow — one finalized declaration line on Product Compliance
 * Detail (06-product-compliance-detail.md §2). Deliberately not
 * `FieldRow` (page 4's component): that one is bound to
 * `ExtractedDeclaration`/confidence bands and requires an `onCorrect`
 * callback — an edit affordance this read-only, finalized view has no use
 * for. This page's data (`DeclarationCheck`: fieldId/passed/value/
 * violationCategoryId/detail) is a different, simpler shape doing a
 * different job.
 *
 * A failed row's badge text is the taxonomy category name itself (e.g.
 * "MRP Non-Compliance"), not a generic "Fail" —06 §2's explicit
 * requirement. The full rule citation (with legal basis + detail) lives in
 * the Violation Summary, not duplicated here.
 */

export interface ChecklistRowProps {
  line: DeclarationCheck;
  fieldLabel: string;
  notDetectedLabel: string;
  passedLabel: string;
  /** Taxonomy category name — required when `line.passed` is false. */
  violationLabel?: string;
}

export function ChecklistRow({
  line,
  fieldLabel,
  notDetectedLabel,
  passedLabel,
  violationLabel,
}: ChecklistRowProps) {
  return (
    <div className="ux4g-card ux4g-card-outline lmcs-checklist-row">
      <div className="lmcs-checklist-row-badge">
        {line.passed ? (
          <span className="ux4g-tag-tonal-success ux4g-tag-s">
            <span className="ux4g-icon-outlined" aria-hidden="true">
              check_circle
            </span>
            <span className="ux4g-label-s-default">{passedLabel}</span>
          </span>
        ) : (
          <span className="ux4g-tag-tonal-error ux4g-tag-s">
            <span className="ux4g-icon-outlined" aria-hidden="true">
              cancel
            </span>
            <span className="ux4g-label-s-default">{violationLabel}</span>
          </span>
        )}
      </div>
      <span className="ux4g-title-s-strong">{fieldLabel}</span>
      <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
        {line.value ?? notDetectedLabel}
      </span>
    </div>
  );
}
