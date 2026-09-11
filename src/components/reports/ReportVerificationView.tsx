"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { fetchReportVerification, type ReportVerification } from "@/lib/api/report-verification";

/**
 * ReportVerificationView — the public QR-verification page's body (Phase
 * 13). `reportId` comes straight from the URL a report's own QR code
 * encodes; there is no search form, unlike the Citizen Grievance lookup
 * panel this otherwise mirrors stylistically.
 *
 * Shows only the 5 fields `GET /verify/reports/{id}` returns — no product,
 * no manufacturer, no officer identity, no evidence. This component
 * cannot expose more than that even by mistake: it renders exactly the
 * response shape and nothing it doesn't have.
 */
export interface ReportVerificationViewProps {
  reportId: string;
  locale: string;
}

export function ReportVerificationView({ reportId, locale }: ReportVerificationViewProps) {
  const t = useTranslations("reportVerification");
  /* `undefined` = not yet fetched (loading); `null` | object = settled.
   * Deriving `loading` from this instead of a separate boolean avoids a
   * synchronous setState at the top of the effect body
   * (react-hooks/set-state-in-effect) — the effect only ever sets state
   * once, from its async callback. */
  const [result, setResult] = useState<ReportVerification | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchReportVerification(reportId).then((data) => {
      if (!cancelled) setResult(data);
    });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (result === undefined) {
    return (
      <p className="ux4g-body-m-default ux4g-text-neutral-secondary" role="status">
        {t("loading")}
      </p>
    );
  }

  const authenticity = result?.authenticity ?? "NOT_FOUND";

  if (authenticity === "NOT_FOUND") {
    return (
      <Alert severity="warning" title={t("notFound.badge")}>
        {t("notFound.body")}
      </Alert>
    );
  }

  return (
    <div className="ux4g-card ux4g-card-outline lmcs-report-verification-card">
      <div className="ux4g-card-body">
        <span className="ux4g-tag-tonal-success ux4g-tag-s" aria-hidden="true">
          {t("valid.badge")}
        </span>
        <dl className="lmcs-report-verification-fields">
          <div>
            <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">{t("reportIdLabel")}</dt>
            <dd className="ux4g-body-m-default">{result?.reportId}</dd>
          </div>
          {result?.inspectionId ? (
            <div>
              <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">{t("inspectionIdLabel")}</dt>
              <dd className="ux4g-body-m-default">{result.inspectionId}</dd>
            </div>
          ) : null}
          {result?.generatedAt ? (
            <div>
              <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">{t("generatedAtLabel")}</dt>
              <dd className="ux4g-body-m-default">
                {new Date(result.generatedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
              </dd>
            </div>
          ) : null}
          {result?.status ? (
            <div>
              <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">{t("statusLabel")}</dt>
              <dd className="ux4g-body-m-default">{result.status}</dd>
            </div>
          ) : null}
          {result?.pdfSha256 ? (
            <div>
              <dt className="ux4g-label-s-default ux4g-text-neutral-secondary">{t("hashLabel")}</dt>
              <dd className="ux4g-body-s-default lmcs-report-verification-hash">
                <code>{result.pdfSha256}</code>
                <button
                  type="button"
                  className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(result.pdfSha256 ?? "");
                    setCopied(true);
                  }}
                >
                  {copied ? t("hashCopied") : t("copyHash")}
                </button>
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary lmcs-measure">{t("valid.body")}</p>
      </div>
    </div>
  );
}
