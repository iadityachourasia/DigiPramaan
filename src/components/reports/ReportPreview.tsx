"use client";

import { Alert } from "@/components/ui/Alert";
import type { ReportDocument } from "@/types";

/**
 * ReportPreview — the in-browser preview 13 §2 requires: "a rendered
 * in-browser preview of the PDF layout, not a Download button firing blind."
 *
 * It renders the same `ReportDocument` the PDF and DOCX renderers read, so
 * what a user previews is what downloads. That is only true because there is
 * one assembly step (`buildReportDocument`) behind all three, rather than a
 * preview that re-derives its own view of the data.
 *
 * The attribution block is rendered from real audit-trail data, including the
 * case where there is none: an unverified record says so rather than showing
 * an empty slot a reader might fill in themselves.
 */

export interface ReportPreviewProps {
  document: ReportDocument;
  /** False for every PDF this app generates — jsPDF emits no /StructTreeRoot. */
  pdfIsTagged: boolean;
  locale: string;
  labels: {
    heading: string;
    government: string;
    ministry: string;
    department: string;
    documentTitle: string;
    generatedAt: string;
    attributionHeading: string;
    verifiedBy: string;
    compiledBy: string;
    role: string;
    region: string;
    verificationCompleted: string;
    compiledOn: string;
    unverifiedTitle: string;
    unverifiedBody: string;
    perRecordVerifierNote: string;
    recordsHeading: (total: number) => string;
    recordsHeadingTruncated: (shown: number, total: number) => string;
    manufacturer: string;
    category: string;
    regionLabel: string;
    complianceStatus: string;
    score: string;
    verifiedByShort: string;
    noViolations: string;
    violationsHeading: string;
    truncatedNote: (count: number) => string;
    verificationHeading: string;
    referenceCode: string;
    verificationBody: string;
    untaggedTitle: string;
    untaggedBody: string;
  };
}

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function ReportPreview({ document, pdfIsTagged, locale, labels }: ReportPreviewProps) {
  const { attribution } = document;

  return (
    <section aria-labelledby="report-preview-heading" className="lmcs-page-section-block">
      <h2 id="report-preview-heading" className="ux4g-title-m-strong">
        {labels.heading}
      </h2>

      {/*
        A-12 / WCAG 1.3.1. `ReportAccessibility` exists so an untagged PDF can
        be warned about rather than linked as though it were fine. jsPDF emits
        no structure tree, so this warning is always shown for generated PDFs
        — an honest surface on a real gap, not decoration.
      */}
      {pdfIsTagged ? null : (
        <Alert severity="warning" title={labels.untaggedTitle}>
          {labels.untaggedBody}
        </Alert>
      )}

      <article className="ux4g-card ux4g-card-outline lmcs-report-preview">
        <div className="ux4g-card-body lmcs-report-preview-body">
          <header className="lmcs-report-preview-masthead">
            <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {labels.government}
            </p>
            <p className="ux4g-label-s-default ux4g-text-neutral-secondary">{labels.ministry}</p>
            <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
              {labels.department}
            </p>
            <h3 className="ux4g-heading-m-strong">{labels.documentTitle}</h3>
            <p className="ux4g-body-m-default">{document.scopeDescription}</p>
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
              {labels.generatedAt}: {formatDateTime(document.generatedAt, locale)}
            </p>
          </header>

          <section aria-labelledby="preview-attribution-heading">
            <h4 id="preview-attribution-heading" className="ux4g-title-s-strong">
              {labels.attributionHeading}
            </h4>

            {attribution.kind === "unverified" ? (
              <Alert severity="info" title={labels.unverifiedTitle}>
                {labels.unverifiedBody}
              </Alert>
            ) : (
              <dl className="lmcs-report-attribution">
                <div>
                  <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">
                    {attribution.kind === "verifier" ? labels.verifiedBy : labels.compiledBy}
                  </dt>
                  <dd className="ux4g-body-m-default">{attribution.name}</dd>
                </div>
                <div>
                  <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">
                    {labels.role}
                  </dt>
                  <dd className="ux4g-body-m-default">{attribution.role}</dd>
                </div>
                <div>
                  <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">
                    {labels.region}
                  </dt>
                  <dd className="ux4g-body-m-default">{attribution.region}</dd>
                </div>
                <div>
                  <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">
                    {attribution.kind === "verifier"
                      ? labels.verificationCompleted
                      : labels.compiledOn}
                  </dt>
                  <dd className="ux4g-body-m-default">
                    {formatDateTime(
                      attribution.kind === "verifier"
                        ? attribution.verifiedAt
                        : attribution.compiledAt,
                      locale
                    )}
                  </dd>
                </div>
              </dl>
            )}

            {/* A compiler did not verify these records; each carries its own verifier. */}
            {attribution.kind === "compiler" ? (
              <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
                {labels.perRecordVerifierNote}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="preview-records-heading">
            <h4 id="preview-records-heading" className="ux4g-title-s-strong">
              {document.truncated
                ? labels.recordsHeadingTruncated(document.records.length, document.totalRecords)
                : labels.recordsHeading(document.totalRecords)}
            </h4>

            <ol className="lmcs-report-record-list">
              {document.records.map((record) => (
                <li key={record.recordId} className="lmcs-report-record">
                  <p className="ux4g-title-s-strong">
                    {record.productName} — {record.scanId}
                  </p>
                  <p className="ux4g-body-s-default">
                    {labels.manufacturer}: {record.manufacturerName}
                  </p>
                  <p className="ux4g-body-s-default">
                    {labels.category}: {record.category} · {labels.regionLabel}: {record.region}
                  </p>
                  <p className="ux4g-body-s-default">
                    {labels.complianceStatus}: {record.complianceStatus}
                    {record.complianceScore === undefined
                      ? null
                      : ` · ${labels.score}: ${record.complianceScore}`}
                  </p>
                  {record.verifier ? (
                    <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
                      {labels.verifiedByShort}: {record.verifier.name} ({record.verifier.role}),{" "}
                      {formatDateTime(record.verifier.verifiedAt, locale)}
                    </p>
                  ) : null}

                  {record.violations.length === 0 ? (
                    <p className="ux4g-body-s-default">{labels.noViolations}</p>
                  ) : (
                    <>
                      <p className="ux4g-label-s-default">{labels.violationsHeading}</p>
                      <ul className="lmcs-report-violation-list">
                        {record.violations.map((violation, index) => (
                          <li
                            key={`${record.recordId}-${index}`}
                            className="ux4g-body-s-default"
                          >
                            {violation.category} ({violation.legalBasis})
                            {violation.detail ? ` — ${violation.detail}` : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </li>
              ))}
            </ol>

            {document.truncated ? (
              <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
                {labels.truncatedNote(document.totalRecords - document.records.length)}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="preview-verification-heading">
            <h4 id="preview-verification-heading" className="ux4g-title-s-strong">
              {labels.verificationHeading}
            </h4>
            <p className="ux4g-body-s-default">
              {labels.referenceCode}: <strong>{document.referenceCode}</strong>
            </p>
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
              {labels.verificationBody}
            </p>
          </section>
        </div>
      </article>
    </section>
  );
}
