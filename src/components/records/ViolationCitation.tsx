import type { Violation } from "@/types";

/**
 * ViolationCitation — one entry in the Violation Summary
 * (06-product-compliance-detail.md §3), the page's "emotional and legal
 * core" per its own design note. Rendered as a distinct, heavier-weight
 * bordered block — a "quotable unit" — rather than a plain bullet, per the
 * spec's explicit typographic instruction. Format matches the spec's own
 * two examples exactly: "{category} — {legalBasis}" with ", {detail}"
 * appended when present.
 */

export interface ViolationCitationProps {
  violation: Violation;
}

export function ViolationCitation({ violation }: ViolationCitationProps) {
  return (
    <div className="lmcs-violation-citation" role="listitem">
      <span className="ux4g-icon-outlined lmcs-violation-citation-icon" aria-hidden="true">
        gavel
      </span>
      <p className="ux4g-title-s-strong lmcs-violation-citation-text">
        {violation.category} — {violation.legalBasis}
        {violation.detail ? `, ${violation.detail}` : ""}
      </p>
    </div>
  );
}
