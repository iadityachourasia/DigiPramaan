"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState, ErrorState, Skeleton, StatusBadge } from "@/components/shared";
import { Alert } from "@/components/ui/Alert";
import { useCase } from "@/lib/hooks";
import type { CaseStatus } from "@/lib/api/cases";
import type { ComplianceStatus } from "@/types";

/**
 * Mirrors backend/app/services/cases/workflow.py's transition table exactly
 * — kept in sync by hand, same discipline as deps/permissions.py's
 * ROLE_PERMISSIONS having a frontend copy. Only used to decide which
 * buttons to SHOW; the backend is still the sole source of truth and
 * re-validates every transition itself.
 */
const ALLOWED_NEXT: Record<CaseStatus, readonly CaseStatus[]> = {
  OPEN: ["ACTION_REQUIRED", "CLOSED"],
  ACTION_REQUIRED: ["REINSPECTION_REQUIRED", "RESOLVED", "CLOSED"],
  REINSPECTION_REQUIRED: ["RESOLVED", "ACTION_REQUIRED", "CLOSED"],
  RESOLVED: ["CLOSED", "REINSPECTION_REQUIRED"],
  CLOSED: [],
};

export function CaseDetailView({ caseId }: { caseId: string }) {
  const t = useTranslations("caseDetail");
  const tVocab = useTranslations("vocabulary");
  const { caseDetail, loading, error, notFound, refetch, transition, transitioning, transitionError } =
    useCase(caseId);
  const [note, setNote] = useState("");

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

  if (loading || !caseDetail) {
    return (
      <div className="lmcs-page-section">
        <Skeleton height="4rem" />
        <Skeleton height="10rem" />
      </div>
    );
  }

  const nextStatuses = ALLOWED_NEXT[caseDetail.status] ?? [];

  async function handleTransition(toStatus: CaseStatus) {
    await transition(toStatus, note || undefined);
    setNote("");
  }

  return (
    <div className="lmcs-page-section">
      <section aria-labelledby="case-heading" className="lmcs-page-section-block">
        <h1 id="case-heading" className="ux4g-heading-xl-strong">
          {t("heading", { id: caseDetail.id.slice(0, 8) })}
        </h1>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {caseDetail.record?.productName} · {caseDetail.record?.manufacturerName}
        </p>
        <span className="ux4g-tag-s ux4g-tag-tonal-info">{caseDetail.status}</span>
      </section>

      {caseDetail.record ? (
        <section className="ux4g-card ux4g-card-outline">
          <div className="ux4g-card-body lmcs-page-section-block">
            <h2 className="ux4g-title-m-strong">{t("recordHeading")}</h2>
            <StatusBadge
              status={caseDetail.record.complianceStatus as ComplianceStatus}
              label={tVocab(`complianceStatus.${caseDetail.record.complianceStatus}`)}
            />
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary">{caseDetail.record.region}</p>
          </div>
        </section>
      ) : null}

      {transitionError ? (
        <Alert severity="error" title={t("transitionErrorTitle")}>
          {transitionError}
        </Alert>
      ) : null}

      {nextStatuses.length > 0 ? (
        <section aria-labelledby="transition-heading" className="ux4g-card ux4g-card-outline">
          <div className="ux4g-card-body lmcs-page-section-block">
            <h2 id="transition-heading" className="ux4g-title-m-strong">
              {t("transition.heading")}
            </h2>
            <label className="ux4g-label-s-default" htmlFor="transition-note">
              {t("transition.noteLabel")}
            </label>
            <textarea
              id="transition-note"
              aria-label={t("transition.noteLabel")}
              className="ux4g-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
            <div className="lmcs-record-detail-actions">
              {nextStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  className="ux4g-btn ux4g-btn-primary ux4g-btn-sm"
                  disabled={transitioning}
                  onClick={() => handleTransition(status)}
                >
                  {t("transition.moveTo", { status })}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="history-heading" className="lmcs-page-section-block">
        <h2 id="history-heading" className="ux4g-title-m-strong">
          {t("history.heading")}
        </h2>
        {!caseDetail.history || caseDetail.history.length === 0 ? (
          <EmptyState icon="history" title={t("history.emptyTitle")} />
        ) : (
          <ol className="ux4g-body-s-default">
            {caseDetail.history.map((entry, index) => (
              <li key={index}>
                {t("history.entry", {
                  from: entry.fromStatus ?? t("history.created"),
                  to: entry.toStatus,
                  when: entry.changedAt ? new Date(entry.changedAt).toLocaleString() : "",
                })}
                {entry.note ? ` — ${entry.note}` : ""}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
