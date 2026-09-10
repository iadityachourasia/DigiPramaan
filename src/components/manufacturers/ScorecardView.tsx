"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { RecordsTable } from "@/components/records/RecordsTable";
import { EmptyState, ErrorState, MetricCard, Skeleton } from "@/components/shared";
import { Alert } from "@/components/ui/Alert";
import { ViolationBreakdownChart } from "@/components/analytics/ViolationBreakdownChart";
import { Link, useRouter } from "@/i18n/navigation";
import { flagManufacturerForEnforcement } from "@/lib/api/manufacturers";
import { ROUTES } from "@/lib/constants";
import { useAuth, useManufacturerScorecard, usePermission } from "@/lib/hooks";
import { formatShortDate } from "@/lib/utils/format";
import {
  type ComplianceRecord,
  type ViolationCategoryId,
} from "@/types";

import { ComplianceRateChart } from "./ComplianceRateChart";
import { FlagManufacturerDialog } from "./FlagManufacturerDialog";
import { RepeatViolationFlag } from "./RepeatViolationFlag";

/** A trend needs at least two points to be a trend; one scan is a data point. */
const MIN_TREND_POINTS = 2;

function recordsHref(params: Record<string, string>): string {
  return `${ROUTES.records}?${new URLSearchParams(params).toString()}`;
}

/**
 * ScorecardView — one manufacturer's scorecard (09 §3, §4).
 *
 * Everything here is a re-slice of the same record set pages 5, 6 and 7
 * already render: the products table is `RecordsTable` with its now-redundant
 * manufacturer column dropped, the violation breakdown is page 7's chart with
 * a manufacturer-scoped array, and every drill-down goes to Compliance
 * Records through `RecordFilters.manufacturers`, which already existed.
 */
export function ScorecardView({ id, locale }: { id: string; locale: string }) {
  const t = useTranslations("manufacturers");
  const tRecords = useTranslations("records");
  const tVocab = useTranslations("vocabulary");
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoState = searchParams.get("demo") ?? undefined;
  const { user } = useAuth();
  const canFlag = usePermission("record.flagForEnforcement");

  const { scorecard, loading, error, notFound, refetch } = useManufacturerScorecard(
    id,
    demoState
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [flagPending, setFlagPending] = useState(false);
  /** Records the flag couldn't be written to — static seeds have no backing run. */
  const [skippedCount, setSkippedCount] = useState(0);
  const [flagError, setFlagError] = useState(false);

  if (notFound) {
    return (
      <EmptyState
        icon="search_off"
        title={t("detail.notFoundTitle")}
        description={t("detail.notFoundBody")}
        action={
          <Link href={ROUTES.manufacturers} className="ux4g-btn ux4g-btn-primary ux4g-btn-sm">
            {t("detail.backToList")}
          </Link>
        }
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={t("errorBody")}
        action={
          <button
            type="button"
            className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
            onClick={refetch}
          >
            {t("retryLabel")}
          </button>
        }
      />
    );
  }

  if (loading || !scorecard) {
    return (
      <div className="lmcs-page-section">
        <Skeleton height="4rem" />
        <div className="lmcs-kpi-grid">
          <Skeleton height="6rem" />
          <Skeleton height="6rem" />
          <Skeleton height="6rem" />
        </div>
        <Skeleton height="var(--lmcs-chart-height)" />
      </div>
    );
  }

  const { summary, products, complianceTrend, violationBreakdown } = scorecard;

  /*
   * The records a manufacturer-level flag would cover, computed here so the
   * confirmation's count matches what the server will actually write. The
   * server recomputes it from the same rule rather than trusting this list.
   */
  const flagCandidates = products.filter(
    (record) => record.complianceStatus === "Non-Compliant" && !record.flaggedForEnforcement
  );
  const alreadyFlagged = products.some((record) => record.flaggedForEnforcement);

  /*
   * 13 §1.2 puts the Compliance Score on this page; 09's own spec doesn't
   * mention it. Shown as an explicit average across Verified records — a
   * mean of per-record scores, labelled as such, not a new manufacturer-level
   * metric with its own formula.
   */
  const scored = products.filter((record) => record.complianceScore);
  const averageScore =
    scored.length === 0
      ? null
      : Math.round(
          scored.reduce((sum, record) => sum + (record.complianceScore?.value ?? 0), 0) /
            scored.length
        );

  async function handleConfirmFlag() {
    if (!user) return;
    setFlagPending(true);
    const result = await flagManufacturerForEnforcement(id, user.id);
    setFlagPending(false);
    setDialogOpen(false);
    if (result.ok) {
      setFlagError(false);
      setSkippedCount(result.data.skipped.length);
      refetch();
    } else {
      setFlagError(true);
    }
  }

  function handleReScan(record: ComplianceRecord) {
    const params = new URLSearchParams({ category: record.category });
    if (record.manufacturerName) params.set("manufacturer", record.manufacturerName);
    if (record.region) params.set("region", record.region);
    router.push(`${ROUTES.scan}?${params.toString()}`);
  }

  function handleGenerateReport(record: ComplianceRecord) {
    router.push(`${ROUTES.reports}?recordId=${encodeURIComponent(record.id)}`);
  }

  function violationHref(categoryId: ViolationCategoryId): string {
    return recordsHref({ manufacturers: summary.name, violationCategoryIds: categoryId });
  }

  const fullHistoryHref = recordsHref({ manufacturers: summary.name });
  /*
   * FIXED: was `?manufacturers=<name>&type=scorecard`, which passed a name
   * where `ReportScope`'s manufacturer variant expects `manufacturerId`. The
   * id is the stable identity — this page's own route is
   * /manufacturers/[id] — so the type was right and the URL was wrong. Page
   * 10 reads this shape in `scopeFromParams`.
   */
  const exportHref = `${ROUTES.reports}?${new URLSearchParams({
    type: "scorecard",
    manufacturerId: summary.id,
  }).toString()}`;

  return (
    <div className="lmcs-page-section">
      {/* Header */}
      <section aria-labelledby="manufacturer-heading" className="lmcs-page-section-block">
        <h1 id="manufacturer-heading" className="ux4g-heading-xl-strong">
          {summary.name}
        </h1>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {summary.firstScannedAt
            ? t("detail.scannedRange", {
                from: formatShortDate(summary.firstScannedAt, locale),
                to: formatShortDate(summary.lastScannedAt, locale),
              })
            : t("detail.neverScanned")}
        </p>

        {/*
          No inverse badge. A manufacturer below the threshold renders nothing
          here — see RepeatViolationFlag's own doc comment for why a "clear"
          badge would be actively wrong on a government screen.
        */}
        <RepeatViolationFlag
          flagged={scorecard.repeatViolationFlagged}
          title={t("flag.title")}
          message={t("flag.message", {
            count: scorecard.recentNonCompliantCount,
            days: scorecard.repeatViolationThreshold.withinDays,
          })}
        />
      </section>

      {flagError ? (
        <Alert severity="error" title={t("flag.errorTitle")}>
          {t("flag.errorBody")}
        </Alert>
      ) : null}

      {skippedCount > 0 ? (
        <Alert severity="warning" title={t("flag.skippedTitle")}>
          {t("flag.skippedBody", { count: skippedCount })}
        </Alert>
      ) : null}

      {/* Summary tiles */}
      <div className="lmcs-kpi-grid">
        <MetricCard
          label={t("summary.productsScanned")}
          value={String(summary.totalProductsScanned)}
          href={fullHistoryHref}
        />
        <MetricCard
          label={t("summary.complianceRate")}
          value={`${summary.complianceRatePercentage}%`}
          caption={t("summary.complianceRateCaption")}
        />
        {averageScore === null ? null : (
          <MetricCard
            label={t("summary.averageScore")}
            value={String(averageScore)}
            caption={t("summary.averageScoreCaption", { count: scored.length })}
          />
        )}
      </div>

      {/* Compliance trend */}
      <section aria-labelledby="trend-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="trend-heading" className="ux4g-title-m-strong">
            {t("trend.heading")}
          </h2>

          {complianceTrend.length === 0 ? (
            <EmptyState icon="show_chart" title={t("trend.emptyTitle")} description={t("trend.emptyBody")} />
          ) : (
            <>
              <ComplianceRateChart
                data={complianceTrend}
                labels={{
                  heading: t("trend.heading"),
                  dateColumn: t("trend.dateColumn"),
                  rateColumn: t("trend.rateColumn"),
                  sampleSizeColumn: t("trend.sampleSizeColumn"),
                }}
              />
              {/*
                09 §4's thin-data edge case: one scan is a single point, and
                saying so is more honest than drawing a flat line that implies
                a stable record.
              */}
              {complianceTrend.length < MIN_TREND_POINTS ? (
                <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
                  {t("trend.thinDataNote")}
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>

      {/* Violation breakdown */}
      <section aria-labelledby="violation-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="violation-heading" className="ux4g-title-m-strong">
            {t("violations.heading")}
          </h2>
          {violationBreakdown.length === 0 ? (
            <EmptyState icon="check_circle" title={t("violations.emptyTitle")} />
          ) : (
            <ViolationBreakdownChart
              data={violationBreakdown}
              onBarClick={(categoryId) => {
                router.push(violationHref(categoryId));
              }}
              labels={{
                heading: t("violations.heading"),
                countColumn: t("violations.countColumn"),
                categoryColumn: t("violations.categoryColumn"),
              }}
            />
          )}
        </div>
      </section>

      {/* Products */}
      <section aria-labelledby="products-heading" className="lmcs-page-section-block">
        <h2 id="products-heading" className="ux4g-title-m-strong">
          {t("products.heading")}
        </h2>

        <RecordsTable
          records={products}
          loading={false}
          hasActiveFilters={false}
          selectedIds={new Set()}
          onToggleRow={() => undefined}
          onToggleAll={() => undefined}
          showSelection={false}
          hideManufacturerColumn
          canArchive={false}
          onArchive={() => undefined}
          onReScan={handleReScan}
          onGenerateReport={handleGenerateReport}
          locale={locale}
          onClearFilters={() => undefined}
          labels={{
            columnThumbnail: tRecords("table.columnThumbnail"),
            columnProduct: tRecords("table.columnProduct"),
            columnManufacturer: tRecords("table.columnManufacturer"),
            columnScanDate: tRecords("table.columnScanDate"),
            columnStatus: tRecords("table.columnStatus"),
            columnViolations: tRecords("table.columnViolations"),
            columnSource: tRecords("table.columnSource"),
            columnLastUpdated: tRecords("table.columnLastUpdated"),
            columnActions: tRecords("table.columnActions"),
            caption: t("products.heading"),
            view: tRecords("table.view"),
            reScan: tRecords("table.reScan"),
            generateReport: tRecords("table.generateReport"),
            archive: tRecords("table.archive"),
            selectAll: tRecords("table.selectAll"),
            selectRow: (productName) => tRecords("table.selectRow", { productName }),
            emptyFilteredTitle: t("products.emptyTitle"),
            emptyFilteredBody: t("products.emptyBody"),
            clearFilters: tRecords("filters.clearAll"),
            emptyTitle: t("products.emptyTitle"),
            emptyBody: t("products.emptyBody"),
            emptyAction: tRecords("table.emptyAction"),
            statusLabels: {
              Pending: tVocab("complianceStatus.Pending"),
              Compliant: tVocab("complianceStatus.Compliant"),
              "Non-Compliant": tVocab("complianceStatus.Non-Compliant"),
              "Needs Review": tVocab("complianceStatus.Needs Review"),
              "Not Applicable": tVocab("complianceStatus.Not Applicable"),
            },
            sourceLabels: {
              "Officer-Scanned": tVocab("sourceTag.Officer-Scanned"),
              "Citizen-Reported": tVocab("sourceTag.Citizen-Reported"),
              "E-commerce-Sourced": tVocab("sourceTag.E-commerce-Sourced"),
            },
          }}
        />

        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {t("exactMatchNote")}
        </p>
      </section>

      {/* Actions */}
      <section aria-labelledby="actions-heading" className="lmcs-page-section-block">
        <h2 id="actions-heading" className="ux4g-sr-only">
          {t("actions.heading")}
        </h2>
        <div className="lmcs-record-detail-actions">
          <Link href={fullHistoryHref} className="ux4g-btn ux4g-btn-outline-primary">
            {t("actions.viewFullHistory")}
          </Link>

          {/*
            Reviewer keeps read + export and loses only this — the Role
            Permission Matrix puts Flag for Enforcement with Enforcement
            Officer and Admin.
          */}
          {canFlag ? (
            <button
              type="button"
              className="ux4g-btn ux4g-btn-primary"
              onClick={() => setDialogOpen(true)}
              disabled={flagCandidates.length === 0}
            >
              {alreadyFlagged && flagCandidates.length === 0
                ? t("actions.alreadyFlagged")
                : t("actions.flagForEnforcement")}
            </button>
          ) : null}

          <Link href={exportHref} className="ux4g-btn ux4g-btn-outline-primary">
            {t("actions.exportScorecard")}
          </Link>
        </div>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {t("actions.exportNote")}
        </p>
      </section>

      <FlagManufacturerDialog
        open={dialogOpen}
        manufacturerName={summary.name}
        records={flagCandidates}
        pending={flagPending}
        onConfirm={handleConfirmFlag}
        onCancel={() => setDialogOpen(false)}
        labels={{
          title: t("flag.dialogTitle"),
          body: t("flag.dialogBody", {
            count: flagCandidates.length,
            manufacturer: summary.name,
          }),
          recordsHeading: t("flag.dialogRecordsHeading"),
          confirm: t("flag.dialogConfirm"),
          confirming: t("flag.dialogConfirming"),
          cancel: t("flag.dialogCancel"),
        }}
      />
    </div>
  );
}
