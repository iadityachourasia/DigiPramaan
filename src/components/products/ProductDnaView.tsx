"use client";

import { useTranslations } from "next-intl";

import { EmptyState, ErrorState, MetricCard, Skeleton, StatusBadge } from "@/components/shared";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useProductDna } from "@/lib/hooks";
import type { InspectionTimelineEntry } from "@/lib/api/productDna";
import type { ComplianceStatus } from "@/types";

const RISK_BADGE_CLASS: Record<string, string> = {
  LOW: "ux4g-tag-tonal-success",
  MODERATE: "ux4g-tag-tonal-warning",
  HIGH: "ux4g-tag-tonal-error",
  CRITICAL: "ux4g-tag-tonal-error",
};

/**
 * ProductDnaView — Phase 4, Product Compliance DNA. Net-new page, no mock
 * equivalent — reads the real FastAPI backend directly (see
 * lib/hooks/useProductDna.ts). Reuses the same shared components/design
 * tokens as every other page rather than inventing new patterns.
 */
export function ProductDnaView({ productId }: { productId: string }) {
  const t = useTranslations("productDna");
  const tVocab = useTranslations("vocabulary");
  const tBarcode = useTranslations("barcode");
  const { dna, loading, error, notFound, refetch } = useProductDna(productId);

  if (notFound) {
    return <EmptyState icon="search_off" title={t("notFoundTitle")} description={t("notFoundBody")} />;
  }

  if (error) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={t("errorBody")}
        action={
          <button type="button" className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm" onClick={refetch}>
            {t("retryLabel")}
          </button>
        }
      />
    );
  }

  if (loading || !dna) {
    return (
      <div className="lmcs-page-section">
        <Skeleton height="4rem" />
        <div className="lmcs-kpi-grid">
          <Skeleton height="6rem" />
          <Skeleton height="6rem" />
          <Skeleton height="6rem" />
        </div>
      </div>
    );
  }

  const columns: DataTableColumn<InspectionTimelineEntry>[] = [
    {
      key: "verifiedAt",
      header: t("timeline.columnVerifiedAt"),
      render: (row) => (row.verifiedAt ? new Date(row.verifiedAt).toLocaleDateString() : "—"),
    },
    {
      key: "status",
      header: t("timeline.columnStatus"),
      cellVariant: "tags",
      render: (row) => (
        <StatusBadge
          status={row.complianceStatus as ComplianceStatus}
          label={tVocab(`complianceStatus.${row.complianceStatus}`)}
        />
      ),
    },
    {
      key: "score",
      header: t("timeline.columnScore"),
      render: (row) => (row.complianceScore === null ? "—" : String(row.complianceScore)),
    },
    {
      key: "recordId",
      header: t("timeline.columnRecordId"),
      render: (row) => <span className="ux4g-body-s-default ux4g-text-neutral-secondary">{row.recordId}</span>,
    },
  ];

  return (
    <div className="lmcs-page-section">
      <section aria-labelledby="product-dna-heading" className="lmcs-page-section-block">
        <h1 id="product-dna-heading" className="ux4g-heading-xl-strong">
          {dna.genericName}
        </h1>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {dna.legalEntity ? t("subheading", { entity: dna.legalEntity.name }) : t("subheadingUnknownEntity")}
          {dna.brand ? ` · ${dna.brand}` : ""}
          {dna.netQuantityNormalized ? ` · ${dna.netQuantityNormalized}` : ""}
        </p>
        {dna.trustedIdentifier ? (
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            <span className="ux4g-tag ux4g-tag-tonal-neutral ux4g-tag-s">
              {dna.trustedIdentifier.symbology} {dna.trustedIdentifier.value}
            </span>{" "}
            {tBarcode("trustedCaption")}
          </p>
        ) : null}
      </section>

      <div className="lmcs-kpi-grid">
        <MetricCard label={t("summary.inspections")} value={String(dna.inspectionTimeline.length)} />
        <MetricCard
          label={t("summary.riskScore")}
          value={`${dna.riskScore}/100`}
          caption={dna.riskLevel}
        />
        <MetricCard label={t("summary.recurringViolations")} value={String(dna.recurringViolations.length)} />
      </div>

      {dna.riskReasons.length > 0 ? (
        <section aria-labelledby="risk-heading" className="ux4g-card ux4g-card-outline">
          <div className="ux4g-card-body lmcs-page-section-block">
            <h2 id="risk-heading" className="ux4g-title-m-strong">
              {t("risk.heading")}
              <span className={`${RISK_BADGE_CLASS[dna.riskLevel] ?? "ux4g-tag-tonal-neutral"} ux4g-tag-s`} style={{ marginInlineStart: "0.5rem" }}>
                {dna.riskLevel} — {dna.riskScore}/100
              </span>
            </h2>
            <ul className="ux4g-body-s-default">
              {dna.riskReasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {dna.openCase ? (
        <section aria-labelledby="case-heading" className="ux4g-card ux4g-card-outline">
          <div className="ux4g-card-body lmcs-page-section-block">
            <h2 id="case-heading" className="ux4g-title-m-strong">
              {t("openCase.heading")}
            </h2>
            <p className="ux4g-body-s-default">{t("openCase.status", { status: dna.openCase.status })}</p>
            <Link href={ROUTES.caseDetail(dna.openCase.id)} className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">
              {t("openCase.viewCase")}
            </Link>
          </div>
        </section>
      ) : null}

      {dna.recurringViolations.length > 0 ? (
        <section aria-labelledby="recurring-heading" className="ux4g-card ux4g-card-outline">
          <div className="ux4g-card-body lmcs-page-section-block">
            <h2 id="recurring-heading" className="ux4g-title-m-strong">
              {t("recurring.heading")}
            </h2>
            <ul className="ux4g-body-s-default">
              {dna.recurringViolations.map((v) => (
                <li key={v.categoryId}>{t("recurring.entry", { category: v.categoryId, count: v.count })}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="timeline-heading" className="lmcs-page-section-block">
        <h2 id="timeline-heading" className="ux4g-title-m-strong">
          {t("timeline.heading")}
        </h2>
        <DataTable
          columns={columns}
          rows={dna.inspectionTimeline}
          getRowKey={(row) => row.recordId}
          caption={t("timeline.heading")}
          emptyState={{ icon: "history", title: t("timeline.emptyTitle") }}
        />
      </section>
    </div>
  );
}
