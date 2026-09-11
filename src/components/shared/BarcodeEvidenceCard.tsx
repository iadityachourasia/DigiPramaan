"use client";

import type { BarcodeAnalysis, BarcodeDecodeResult } from "@/types";

export interface BarcodeEvidenceCardLabels {
  heading: string;
  checksumValid: string;
  sourceImage: (angle: string) => string;
  viewEvidence: string;
  needsReviewHeading: string;
  needsReviewTag: string;
  needsReviewBody: string;
  viewCandidate: string;
  invalidChecksum: string;
}

export interface BarcodeEvidenceCardProps {
  analysis: BarcodeAnalysis | null;
  /** Only called for a candidate that actually has a bbox to highlight. */
  onViewEvidence: (candidate: BarcodeDecodeResult) => void;
  labels: BarcodeEvidenceCardLabels;
  /** Extra class(es) for the outer element — e.g. a top margin when this
   * card follows other content within the same section, rather than
   * sitting as its own page-level section (which relies on the page's own
   * gap instead). Applied only when the card actually renders something,
   * so there's never a stray empty-margin gap when there's no barcode. */
  className?: string;
}

/**
 * BarcodeEvidenceCard — the "Product Identifier" evidence card shared by
 * the Extraction & Verification page and Record Detail (Phase 8).
 *
 * §K's own three states, exactly: a trusted checksum-valid identifier
 * (shown prominently, with a "View Barcode Evidence" action reusing
 * ImageViewer's existing `highlightBbox` prop — no new viewer machinery),
 * a conflicting set of candidates ("NEEDS REVIEW", every candidate listed,
 * none silently picked), or nothing at all when there's no barcode
 * evidence — "show nothing alarming" means exactly that: this component
 * renders `null`, not an empty-state placeholder.
 */
export function BarcodeEvidenceCard({
  analysis,
  onViewEvidence,
  labels,
  className,
}: BarcodeEvidenceCardProps) {
  if (!analysis || analysis.status === "none") return null;
  const sectionClassName = `ux4g-card ux4g-card-outline${className ? ` ${className}` : ""}`;

  if (analysis.status === "trusted" && analysis.trustedIdentifier) {
    const identifier = analysis.trustedIdentifier;
    return (
      <section aria-labelledby="barcode-heading" className={sectionClassName}>
        <div className="ux4g-card-body lmcs-page-section-block">
          <h3 id="barcode-heading" className="ux4g-title-s-strong">
            {labels.heading}
          </h3>
          <p className="ux4g-body-m-default">
            {identifier.symbology}
            <br />
            <span className="ux4g-heading-s-strong">{identifier.rawValue}</span>
          </p>
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            <span className="ux4g-tag ux4g-tag-tonal-success ux4g-tag-s">
              <span className="ux4g-icon-outlined" aria-hidden="true">
                check_circle
              </span>
              {labels.checksumValid}
            </span>{" "}
            {labels.sourceImage(identifier.sourceAngle)}
          </p>
          {identifier.bbox ? (
            <button
              type="button"
              className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
              onClick={() => onViewEvidence(identifier)}
            >
              <span className="ux4g-icon-outlined" aria-hidden="true">
                image_search
              </span>
              {labels.viewEvidence}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  // status === "needs_review"
  return (
    <section aria-labelledby="barcode-heading" className={sectionClassName}>
      <div className="ux4g-card-body lmcs-page-section-block">
        <h3 id="barcode-heading" className="ux4g-title-s-strong">
          {labels.needsReviewHeading}
          <span className="ux4g-tag ux4g-tag-tonal-warning ux4g-tag-s" style={{ marginInlineStart: "0.5rem" }}>
            {labels.needsReviewTag}
          </span>
        </h3>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">{labels.needsReviewBody}</p>
        <ul className="lmcs-barcode-candidate-list">
          {analysis.candidates.map((candidate, index) => (
            <li key={`${candidate.normalizedValue}-${index}`} className="lmcs-barcode-candidate-row">
              <span className="ux4g-body-s-default">
                {candidate.symbology} {candidate.rawValue}
              </span>
              {candidate.checksumValid ? (
                <span className="ux4g-tag ux4g-tag-tonal-success ux4g-tag-s">{labels.checksumValid}</span>
              ) : (
                <span className="ux4g-tag ux4g-tag-tonal-error ux4g-tag-s">{labels.invalidChecksum}</span>
              )}
              {candidate.bbox ? (
                <button
                  type="button"
                  className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
                  onClick={() => onViewEvidence(candidate)}
                >
                  {labels.viewCandidate}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
