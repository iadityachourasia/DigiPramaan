"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { ErrorState } from "@/components/shared";
import { Alert } from "@/components/ui/Alert";
import { Link } from "@/i18n/navigation";
import { reportDownloadHref } from "@/lib/api/reports";
import { ROUTES } from "@/lib/constants";
import { useAuth, useReportBuilder, useReportHistory } from "@/lib/hooks";
import { LARGE_REPORT_ROW_THRESHOLD, type ReportFormat } from "@/types";

import { DownloadHistoryTable } from "./DownloadHistoryTable";
import { FormatSelect } from "./FormatSelect";
import { ReportPreview } from "./ReportPreview";
import { ReportProgressTracker } from "./ReportProgressTracker";
import { ReportScopePanel } from "./ReportScopePanel";

/**
 * ReportsView — client orchestrator for Reports & Profile (page 10).
 *
 * The page stays usable while a report generates, which 10 §4 asks for
 * explicitly: the tracker appears in the builder section, and Download
 * History below it is untouched.
 */
export function ReportsView({ locale }: { locale: string }) {
  const t = useTranslations("reports");
  const tVocab = useTranslations("vocabulary");
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const demoState = searchParams.get("demo") ?? undefined;
  /*
   * What the PDF QR resolves to (13 §2): a printed report carries a reference
   * code, and scanning it lands here with that code, which pins Download
   * History to the one matching entry. Without this the QR would encode a URL
   * that ignored its own parameter.
   */
  const referenceCode = searchParams.get("reference");

  const builder = useReportBuilder();
  /* Bumped when a report completes, so Download History picks it up. */
  const [historyKey, setHistoryKey] = useState(0);
  const history = useReportHistory(demoState, historyKey);

  const completedReportId = builder.run?.status === "completed" ? builder.run.report?.id : null;
  const [seenReportId, setSeenReportId] = useState<string | null>(null);
  if (completedReportId && completedReportId !== seenReportId) {
    setSeenReportId(completedReportId);
    setHistoryKey((key) => key + 1);
  }

  async function handleGenerate() {
    if (!user) return;
    await builder.generate(user.id, user.fullName);
  }

  const showLargeWarning =
    builder.largeScope && !builder.warningDismissed && builder.run === null;

  const allReports = history.reports ?? [];
  const referencedReport = referenceCode
    ? allReports.find(
        (report) => report.referenceCode.toLowerCase() === referenceCode.toLowerCase()
      )
    : undefined;
  const visibleReports = referenceCode
    ? allReports.filter((report) => report === referencedReport)
    : allReports;

  return (
    <div className="lmcs-page-section">
      {/* Report Builder */}
      <ReportScopePanel
        scope={builder.scope}
        onChangeScope={builder.setScope}
        rowCount={builder.rowCount}
        scopeLabel={builder.scopeLabel}
        labels={{
          heading: t("builder.heading"),
          scopeLabel: t("builder.scopeLabel"),
          scopeRecord: t("builder.scopeRecord"),
          scopeManufacturer: t("builder.scopeManufacturer"),
          scopeFiltered: t("builder.scopeFiltered"),
          scopeNone: t("builder.scopeNone"),
          scopeNoneHint: t("builder.scopeNoneHint"),
          recordScopeNote: (recordId) => t("builder.recordScopeNote", { recordId }),
          manufacturerScopeNote: (manufacturerId) =>
            t("builder.manufacturerScopeNote", { manufacturerId }),
          changeScope: t("builder.changeScope"),
          rowCount: (count) => t("builder.rowCount", { count }),
          filtersHeading: t("builder.filtersHeading"),
          categoryLabel: t("builder.categoryLabel"),
          statusLabel: t("builder.statusLabel"),
          regionLabel: t("builder.regionLabel"),
          manufacturerLabel: t("builder.manufacturerLabel"),
          sourceLabel: t("builder.sourceLabel"),
          dateFromLabel: t("builder.dateFromLabel"),
          dateToLabel: t("builder.dateToLabel"),
          addValue: t("builder.addValue"),
          removeValue: (value) => t("builder.removeValue", { value }),
          statusOptionLabel: (status) => tVocab(`complianceStatus.${status}`),
          sourceOptionLabel: (source) => tVocab(`sourceTag.${source}`),
        }}
      />

      <FormatSelect
        selected={builder.formats}
        onToggle={builder.toggleFormat}
        labels={{
          legend: t("formats.legend"),
          hint: t("formats.hint"),
          formatLabel: (format: ReportFormat) => t(`formats.label.${format}`),
          formatHint: (format: ReportFormat) => t(`formats.hint_${format}`),
        }}
      />

      {/*
        10 §4's "very large report scope — a size/row-count warning before
        generation". A warning, not a second block: the spec asks the user be
        told, not stopped.
      */}
      {showLargeWarning ? (
        <Alert
          severity="warning"
          title={t("largeScope.title")}
          actions={
            <button
              type="button"
              className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
              onClick={builder.dismissWarning}
            >
              {t("largeScope.dismiss")}
            </button>
          }
        >
          {t("largeScope.body", {
            count: builder.rowCount ?? 0,
            threshold: LARGE_REPORT_ROW_THRESHOLD,
          })}
        </Alert>
      ) : null}

      {/*
        Blocked, not pre-disabled. Page 4's Confirm & Verify established this:
        let the officer click and tell them precisely why, rather than leaving
        an inert button with no explanation.
      */}
      {builder.blocked === "zero-records" ? (
        <Alert severity="error" title={t("blocked.zeroRecordsTitle")}>
          {t("blocked.zeroRecordsBody")}
        </Alert>
      ) : null}
      {builder.blocked === "no-format" ? (
        <Alert severity="error" title={t("blocked.noFormatTitle")}>
          {t("blocked.noFormatBody")}
        </Alert>
      ) : null}
      {builder.requestError ? (
        <Alert severity="error" title={t("generationError.title")}>
          {t("generationError.body")}
        </Alert>
      ) : null}

      <div className="lmcs-report-actions">
        <button
          type="button"
          className="ux4g-btn ux4g-btn-primary ux4g-btn-lg"
          onClick={handleGenerate}
          disabled={builder.generating || builder.run?.status === "generating"}
        >
          {builder.generating || builder.run?.status === "generating"
            ? t("actions.generating")
            : t("actions.generate")}
        </button>
        {builder.run ? (
          <button
            type="button"
            className="ux4g-btn ux4g-btn-text-primary"
            onClick={builder.reset}
          >
            {t("actions.startOver")}
          </button>
        ) : null}
      </div>

      {/* Generation progress — same visual language as Scan/Upload (10 §5). */}
      {builder.run ? (
        <section aria-labelledby="report-progress-heading" className="lmcs-page-section-block">
          <h2 id="report-progress-heading" className="ux4g-title-m-strong">
            {t("progress.heading")}
          </h2>
          <ReportProgressTracker
            stages={builder.run.stages}
            onRetry={(stageId) => void builder.retryStage(stageId)}
            labels={{
              stageLabel: (stageId) => t(`progress.stages.${stageId}`),
              retry: t("progress.retry"),
              pending: t("progress.srPending"),
              inProgress: t("progress.srInProgress"),
              completed: t("progress.srCompleted"),
              failed: t("progress.srFailed"),
            }}
          />
        </section>
      ) : null}

      {/* Preview before download (13 §2), then the download links. */}
      {builder.detail ? (
        <>
          <ReportPreview
            document={builder.detail.document}
            pdfIsTagged={builder.detail.accessibility.pdfIsTagged}
            locale={locale}
            labels={{
              heading: t("preview.heading"),
              government: t("preview.government"),
              ministry: t("preview.ministry"),
              department: t("preview.department"),
              documentTitle: t("preview.documentTitle"),
              generatedAt: t("preview.generatedAt"),
              attributionHeading: t("preview.attributionHeading"),
              verifiedBy: t("preview.verifiedBy"),
              compiledBy: t("preview.compiledBy"),
              role: t("preview.role"),
              region: t("preview.region"),
              verificationCompleted: t("preview.verificationCompleted"),
              compiledOn: t("preview.compiledOn"),
              unverifiedTitle: t("preview.unverifiedTitle"),
              unverifiedBody: t("preview.unverifiedBody"),
              perRecordVerifierNote: t("preview.perRecordVerifierNote"),
              recordsHeading: (total) => t("preview.recordsHeading", { total }),
              recordsHeadingTruncated: (shown, total) =>
                t("preview.recordsHeadingTruncated", { shown, total }),
              manufacturer: t("preview.manufacturer"),
              category: t("preview.category"),
              regionLabel: t("preview.regionLabel"),
              complianceStatus: t("preview.complianceStatus"),
              score: t("preview.score"),
              verifiedByShort: t("preview.verifiedByShort"),
              noViolations: t("preview.noViolations"),
              violationsHeading: t("preview.violationsHeading"),
              truncatedNote: (count) => t("preview.truncatedNote", { count }),
              verificationHeading: t("preview.verificationHeading"),
              referenceCode: t("preview.referenceCode"),
              verificationBody: t("preview.verificationBody"),
              untaggedTitle: t("preview.untaggedTitle"),
              untaggedBody: t("preview.untaggedBody"),
            }}
          />

          <section aria-labelledby="report-download-heading" className="lmcs-page-section-block">
            <h2 id="report-download-heading" className="ux4g-title-m-strong">
              {t("download.heading")}
            </h2>
            <div className="lmcs-report-actions">
              {builder.detail.report.formats.map((format) => (
                <a
                  key={format}
                  href={reportDownloadHref(builder.detail!.report.id, format)}
                  className="ux4g-btn ux4g-btn-primary"
                >
                  <span className="ux4g-icon-outlined" aria-hidden="true">
                    download
                  </span>
                  {t("download.action", { format })}
                </a>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {/* Download History */}
      <section aria-labelledby="report-history-heading" className="lmcs-page-section-block">
        <h2 id="report-history-heading" className="ux4g-title-m-strong">
          {t("history.heading")}
        </h2>

        {referenceCode ? (
          referencedReport ? (
            <Alert severity="success" title={t("reference.foundTitle")}>
              {t("reference.foundBody", { code: referencedReport.referenceCode })}
            </Alert>
          ) : (
            <Alert severity="warning" title={t("reference.notFoundTitle")}>
              {t("reference.notFoundBody", { code: referenceCode })}
            </Alert>
          )
        ) : null}

        {history.error ? (
          <ErrorState
            title={t("history.errorTitle")}
            description={t("history.errorBody")}
            action={
              <Link
                href={ROUTES.reports}
                className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
              >
                {t("history.retry")}
              </Link>
            }
          />
        ) : (
          <DownloadHistoryTable
            reports={visibleReports}
            loading={history.loading}
            locale={locale}
            labels={{
              caption: t("history.heading"),
              columnName: t("history.columnName"),
              columnFormats: t("history.columnFormats"),
              columnRows: t("history.columnRows"),
              columnGeneratedAt: t("history.columnGeneratedAt"),
              columnGeneratedBy: t("history.columnGeneratedBy"),
              columnReference: t("history.columnReference"),
              columnActions: t("history.columnActions"),
              download: (format, name) => t("history.download", { format, name }),
              rowCount: (count) => t("history.rowCount", { count }),
              emptyTitle: t("history.emptyTitle"),
              emptyBody: t("history.emptyBody"),
            }}
          />
        )}
      </section>

      {/*
        Profile lives on its own route, linked from here rather than given a
        second sidebar item that would contradict the existing combined
        "Reports & Profile" nav label.
      */}
      <div className="lmcs-report-actions">
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {t("profileLinkIntro")}
        </p>
        <Link href={ROUTES.profile} className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm">
          {t("profileLink")}
        </Link>
      </div>
    </div>
  );
}
