"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { BarcodeEvidenceCard, EmptyState, StatusBadge } from "@/components/shared";
import { Alert } from "@/components/ui/Alert";
import { Link } from "@/i18n/navigation";
import { ImageViewer } from "@/components/scan/ImageViewer";
import { ROUTES } from "@/lib/constants";
import { useAuth, usePermission, useRecordDetail } from "@/lib/hooks";
import { fetchReportsForRecord, getRecordReportDownloadHref } from "@/lib/api/reports";
import { formatShortDate } from "@/lib/utils/format";
import {
  violationCategory,
  type BarcodeDecodeResult,
  type CaptureSlotAngle,
  type GeneratedReport,
} from "@/types";

import { ChecklistRow } from "./ChecklistRow";
import { EvidenceGallery } from "./EvidenceGallery";
import { ViolationCitation } from "./ViolationCitation";

export interface RecordDetailViewProps {
  recordId: string;
  locale: string;
}

type Angle = Extract<CaptureSlotAngle, "front" | "back" | "side_pdp">;

/**
 * RecordDetailView — client orchestrator for Product Compliance Detail
 * (page 6). Read-mostly: the only mutations are Flag as Needs Review
 * (extended to also clear) and Flag for Enforcement (new — see the page 6
 * plan §7), both via `useRecordDetail`.
 */
export function RecordDetailView({ recordId, locale }: RecordDetailViewProps) {
  const t = useTranslations("recordDetail");
  const tVocab = useTranslations("vocabulary");
  const tDeclarationField = useTranslations("declarationField");
  const tAuditEvent = useTranslations("recordDetail.auditTrail.eventType");
  const tGrievanceConcern = useTranslations("grievance.concerns");
  const tBarcode = useTranslations("barcode");
  const { user } = useAuth();
  const canFlagNeedsReview = usePermission("record.flagNeedsReview");
  const canFlagForEnforcement = usePermission("record.flagForEnforcement");

  const { record, notFound, pending, mutationError, setNeedsReview, flagForEnforcement, resolveReviewItem } =
    useRecordDetail(recordId);
  const canResolveReview = usePermission("verification.confirm");

  const [activeAngle, setActiveAngle] = useState<Angle>("front");
  const [highlightBbox, setHighlightBbox] = useState<[number, number, number, number] | undefined>(undefined);
  const imageSectionRef = useRef<HTMLElement>(null);

  const [reportHistory, setReportHistory] = useState<GeneratedReport[] | null>(null);
  const [reportHistoryError, setReportHistoryError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchReportsForRecord(recordId, user.id, user.fullName).then((result) => {
      if (cancelled) return;
      if (result.ok) setReportHistory(result.data);
      else setReportHistoryError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [recordId, user]);

  // P2 hardening (F-010): a real Bearer-authenticated fetch to issue a
  // short-lived download ticket first, then a normal browser navigation
  // to the download URL — a plain <a href> can no longer carry the raw
  // session token directly.
  async function handleDownload(report: GeneratedReport, format: (typeof report.formats)[number]) {
    const href = await getRecordReportDownloadHref(report, format);
    window.location.assign(href);
  }

  if (notFound) {
    return (
      <EmptyState icon="search_off" title={t("notFoundTitle")} description={t("notFoundBody")} />
    );
  }

  if (!record) {
    return (
      <div className="ux4g-upload-content" role="status">
        <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
      </div>
    );
  }

  function angleLabel(angle: Angle): string {
    return t(`sourceImage.angle.${angle}`);
  }

  function handleToggleNeedsReview() {
    if (!user) return;
    /* `record` is guaranteed non-null here — this handler only exists
     * after the `!record` early return above — but TS doesn't narrow a
     * captured variable across a nested function declaration. */
    setNeedsReview(user.id, !record!.needsReviewFlag);
  }

  function handleFlagForEnforcement() {
    if (!user) return;
    flagForEnforcement();
  }

  function handleViewEvidence(imageId: string, bbox: [number, number, number, number]) {
    const match = record!.capturedImages.find((img) => img.id === imageId);
    if (match && (match.angle === "front" || match.angle === "back" || match.angle === "side_pdp")) {
      setActiveAngle(match.angle);
    }
    // The backend's degenerate-bbox sentinel (0,0,1,1) means "this evidence
    // has no real geometry" (a Gemini whole-image OCR fallback), not a real
    // one-natural-pixel region — drawing it literally would highlight a
    // near-invisible speck in the image's top-left corner. Still opens the
    // correct image (there IS a real citation), just without a misleading box.
    const isDegenerateBbox = bbox[0] === 0 && bbox[1] === 0 && bbox[2] === 1 && bbox[3] === 1;
    setHighlightBbox(isDegenerateBbox ? undefined : bbox);
    imageSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleViewBarcodeEvidence(candidate: BarcodeDecodeResult) {
    setActiveAngle(candidate.sourceAngle);
    setHighlightBbox(candidate.bbox ?? undefined);
    imageSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="lmcs-page-section">
      <div className="lmcs-record-detail-header">
        <div className="lmcs-record-detail-header-text">
          <h1 className="ux4g-heading-xl-strong">{record.productName}</h1>
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {t("scanIdLabel")}: {record.scanId}
          </p>
        </div>
        <div className="lmcs-record-detail-header-meta">
          <StatusBadge
            status={record.complianceStatus}
            label={tVocab(`complianceStatus.${record.complianceStatus}`)}
          />
          <span className="ux4g-tag-outline-neutral ux4g-tag-s">
            <span className="ux4g-label-s-default">{tVocab(`sourceTag.${record.source}`)}</span>
          </span>
        </div>
      </div>

      <p className="ux4g-label-s-default ux4g-text-neutral-secondary">
        {t("scannedOn", { date: formatShortDate(record.scannedAt, locale) })} ·{" "}
        {t("lastUpdated", { date: formatShortDate(record.lastUpdatedAt, locale) })}
      </p>

      {record.verificationStatus === "Extracted" ? (
        <Alert
          severity="warning"
          title={t("unverifiedBanner.title")}
          actions={
            <Link
              href={ROUTES.extraction(record.id)}
              className="ux4g-btn ux4g-btn-primary ux4g-btn-sm"
            >
              {t("actions.completeVerification")}
            </Link>
          }
        >
          {t("unverifiedBanner.body")}
        </Alert>
      ) : null}

      {mutationError ? (
        <Alert severity="error" title={t("mutationError.title")}>
          {t("mutationError.body")}
        </Alert>
      ) : null}

      {/*
        What the citizen said, on a record they created (page 11). Sits above
        the rule engine findings and is visibly separate from them: these are a
        member of the public reporting what looked wrong, not verified
        violations, and the two must not read as the same kind of statement.
      */}
      {record.citizenReport ? (
        <section
          aria-labelledby="citizen-report-heading"
          className="ux4g-card ux4g-card-outline lmcs-record-detail-section-muted"
        >
          <div className="ux4g-card-body lmcs-page-section-block">
            <h2 id="citizen-report-heading" className="ux4g-title-m-strong">
              {t("citizenReport.heading")}
            </h2>
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
              {t("citizenReport.caveat")}
            </p>

            {record.citizenReport.concerns.length > 0 ? (
              <ul className="lmcs-violation-list">
                {record.citizenReport.concerns.map((concern) => (
                  <li key={concern} className="ux4g-body-m-default">
                    {tGrievanceConcern(concern)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ux4g-body-m-default">{t("citizenReport.noConcerns")}</p>
            )}

            {record.citizenReport.concernNote ? (
              <p className="ux4g-body-m-default">
                {t("citizenReport.noteLabel")}: {record.citizenReport.concernNote}
              </p>
            ) : null}

            {record.citizenReport.shopNameOrLocation ? (
              <p className="ux4g-body-s-default">
                {t("citizenReport.shopLabel")}: {record.citizenReport.shopNameOrLocation}
              </p>
            ) : null}

            <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
              {t("citizenReport.reference")}: {record.citizenReport.reference}
            </p>
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
              {record.citizenReport.hasContactDetails
                ? t("citizenReport.contactAvailable")
                : t("citizenReport.contactAnonymous")}
            </p>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="violations-heading" className="ux4g-card ux4g-card-outline lmcs-record-detail-section-emphasis">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="violations-heading" className="ux4g-title-m-strong">
            {t("violationsHeading")}
          </h2>
          {record.violations.length === 0 ? (
            <div className="ux4g-context-alert ux4g-alert-success">
              <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">
                check_circle
              </span>
              <div className="ux4g-alert-content">
                <span className="ux4g-alert-title">{t("noViolations")}</span>
              </div>
            </div>
          ) : (
            <div className="lmcs-violation-list" role="list">
              {record.violations.map((violation, index) => (
                <ViolationCitation key={`${violation.categoryId}-${index}`} violation={violation} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="checklist-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="checklist-heading" className="ux4g-title-m-strong">
            {t("checklistHeading")}
          </h2>
          <div className="lmcs-checklist-list">
            {record.checklist.map((line) => (
              <ChecklistRow
                key={line.fieldId}
                line={line}
                fieldLabel={tDeclarationField(line.fieldId)}
                notDetectedLabel={t("notDetected")}
                passedLabel={t("passed")}
                recordId={record.id}
                onViewEvidence={handleViewEvidence}
                canResolve={canResolveReview}
                resolvePending={pending}
                onResolve={resolveReviewItem}
                {...(() => {
                  const check = record.extraction.fontSizeChecks?.find((f) => f.fieldId === line.fieldId);
                  return check ? { fontSizeCheck: check } : {};
                })()}
                labels={{
                  explainWithAi: t("explainWithAi"),
                  explaining: t("explaining"),
                  explainError: t("explainError"),
                  summaryLabel: t("explanation.summary"),
                  whatWasFoundLabel: t("explanation.whatWasFound"),
                  whatIsMissingLabel: t("explanation.whatIsMissing"),
                  legalContextLabel: t("explanation.legalContext"),
                  evidenceExplanationLabel: t("explanation.evidenceExplanation"),
                  officerGuidanceLabel: t("explanation.officerGuidance"),
                  insufficientContextNote: t("explanation.insufficientContext"),
                  measuredHeightLabel: t("fontMeasurement.measuredHeight"),
                  requiredHeightLabel: t("fontMeasurement.requiredHeight"),
                  calibrationMethodLabel: t("fontMeasurement.calibrationMethod"),
                  confidenceLabel: t("fontMeasurement.confidence"),
                  resultLabel: t("fontMeasurement.result"),
                  viewEvidence: t("viewEvidence"),
                  resolvePrompt: t("resolve.prompt"),
                  resolvePass: t("resolve.pass"),
                  resolveFail: t("resolve.fail"),
                  resolveNotePlaceholder: t("resolve.notePlaceholder"),
                  resolveSubmit: t("resolve.submit"),
                  resolveCancel: t("resolve.cancel"),
                  resolveError: t("resolve.error"),
                }}
                {...(!line.passed && line.violationCategoryId
                  ? { violationLabel: violationCategory(line.violationCategoryId).category }
                  : {})}
              />
            ))}
          </div>
        </div>
      </section>

      <BarcodeEvidenceCard
        analysis={record.extraction.barcodeAnalysis}
        onViewEvidence={handleViewBarcodeEvidence}
        labels={{
          heading: tBarcode("heading"),
          checksumValid: tBarcode("checksumValid"),
          sourceImage: (angle) => tBarcode("sourceImage", { angle: tBarcode(`angle.${angle}`) }),
          viewEvidence: tBarcode("viewEvidence"),
          needsReviewHeading: tBarcode("needsReviewHeading"),
          needsReviewTag: tBarcode("needsReviewTag"),
          needsReviewBody: tBarcode("needsReviewBody"),
          viewCandidate: tBarcode("viewCandidate"),
          invalidChecksum: tBarcode("invalidChecksum"),
        }}
      />

      <section ref={imageSectionRef} aria-labelledby="source-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="source-heading" className="ux4g-title-m-strong">
            {t("sourceHeading")}
          </h2>
          <ImageViewer
            images={record.capturedImages}
            activeAngle={activeAngle}
            onActiveAngleChange={(angle) => {
              setActiveAngle(angle);
              setHighlightBbox(undefined);
            }}
            labels={{ angle: angleLabel, zoomIn: t("sourceImage.zoomIn"), zoomOut: t("sourceImage.zoomOut") }}
            {...(highlightBbox ? { highlightBbox } : {})}
          />
          <Link
            href={ROUTES.extraction(record.id)}
            className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
          >
            {t("actions.viewInExtraction")}
          </Link>
        </div>
      </section>

      <section aria-labelledby="evidence-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="evidence-heading" className="ux4g-title-m-strong">
            {t("evidenceHeading")}
          </h2>
          <EvidenceGallery
            evidence={record.evidence}
            locale={locale}
            labels={{
              emptyTitle: t("evidenceEmptyTitle"),
              emptyBody: t("evidenceEmptyBody"),
              attachedOn: (date) => t("evidenceAttachedOn", { date }),
            }}
          />
        </div>
      </section>

      <section aria-labelledby="audit-heading" className="ux4g-card ux4g-card-outline lmcs-record-detail-section-muted">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="audit-heading" className="ux4g-title-m-strong">
            {t("auditHeading")}
          </h2>
          <ol className="lmcs-audit-trail">
            {record.auditTrail.map((event) => (
              <li key={event.id} className="lmcs-audit-trail-entry">
                <span className="ux4g-body-s-default">{tAuditEvent(event.type)}</span>
                <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
                  {formatShortDate(event.at, locale)}
                  {event.byUserName ? ` · ${event.byUserName}` : ""}
                </span>
                {event.note ? (
                  <span className="ux4g-label-s-default ux4g-text-neutral-secondary">
                    {event.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="report-history-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="report-history-heading" className="ux4g-title-m-strong">
            {t("reportHistory.heading")}
          </h2>
          {reportHistoryError ? (
            <p className="ux4g-body-s-default ux4g-text-error">{t("reportHistory.error")}</p>
          ) : reportHistory && reportHistory.length === 0 ? (
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary">{t("reportHistory.empty")}</p>
          ) : reportHistory ? (
            <ul className="lmcs-report-history-list">
              {reportHistory.map((report) => (
                <li key={report.id} className="lmcs-report-history-entry">
                  <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
                    {t("reportHistory.generatedOn", { date: formatShortDate(report.generatedAt, locale) })}
                  </span>
                  <div className="lmcs-record-detail-actions">
                    {report.formats.map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => void handleDownload(report, format)}
                        className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
                      >
                        {t("reportHistory.download", { format })}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <div className="lmcs-record-detail-actions">
        {canFlagNeedsReview ? (
          <button
            type="button"
            className="ux4g-btn ux4g-btn-outline-primary"
            onClick={handleToggleNeedsReview}
            disabled={pending}
          >
            <span className="ux4g-icon-outlined" aria-hidden="true">
              flag
            </span>
            {record.needsReviewFlag ? t("actions.clearNeedsReview") : t("actions.flagAsNeedsReview")}
          </button>
        ) : null}

        <Link
          href={`${ROUTES.reports}?recordId=${encodeURIComponent(record.id)}`}
          className="ux4g-btn ux4g-btn-outline-primary"
        >
          <span className="ux4g-icon-outlined" aria-hidden="true">
            summarize
          </span>
          {t("actions.generateReport")}
        </Link>

        {canFlagForEnforcement ? (
          <button
            type="button"
            className="ux4g-btn ux4g-btn-outline-primary"
            onClick={handleFlagForEnforcement}
            disabled={pending || record.flaggedForEnforcement}
          >
            <span className="ux4g-icon-outlined" aria-hidden="true">
              gavel
            </span>
            {record.flaggedForEnforcement
              ? t("actions.alreadyFlaggedForEnforcement")
              : t("actions.flagForEnforcement")}
          </button>
        ) : null}

        {/*
          Phase 4 USPs (Product Compliance DNA / Compliance Follow-Through).
          `productId`/`activeCaseId` are additive, currently-inert optional
          fields on ComplianceRecord (see that type's own comment) — the
          mock data this page reads never populates them, since the mock
          store has no relationship to the real backend's Product/
          ViolationCase tables. These links render correctly whenever a
          record actually carries real backend ids; today they simply never
          appear, which is the honest, forward-compatible state rather than
          a broken link to nothing.
        */}
        {record.productId ? (
          <Link href={ROUTES.productDna(record.productId)} className="ux4g-btn ux4g-btn-outline-primary">
            <span className="ux4g-icon-outlined" aria-hidden="true">
              science
            </span>
            {t("actions.viewProductDna")}
          </Link>
        ) : null}

        {record.activeCaseId ? (
          <Link href={ROUTES.caseDetail(record.activeCaseId)} className="ux4g-btn ux4g-btn-outline-primary">
            <span className="ux4g-icon-outlined" aria-hidden="true">
              folder_open
            </span>
            {t("actions.viewCase")}
          </Link>
        ) : null}

        <Link href={ROUTES.records} className="ux4g-btn ux4g-btn-text-primary">
          {t("actions.backToRecords")}
        </Link>
      </div>
    </div>
  );
}
