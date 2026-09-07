"use client";

import { useTranslations } from "next-intl";

import type { GrievanceReceipt } from "@/types";

/**
 * GrievanceConfirmation — the tracking reference and what happens next
 * (page 11 §2).
 *
 * IDENTICAL FOR AN ANONYMOUS SUBMISSION
 * --------------------------------------
 * Same heading, same reference prominence, same "what happens next" copy,
 * whether or not the citizen left contact details. Leaving them adds one extra
 * line saying we may be in touch; it removes nothing, dims nothing, and adds no
 * note about what was not provided. A confirmation that visibly downgraded
 * itself for an anonymous reporter would be exactly the "lesser path" 11 §5
 * forbids.
 */

export interface GrievanceConfirmationProps {
  receipt: GrievanceReceipt;
  hasContactDetails: boolean;
  locale: string;
}

export function GrievanceConfirmation({
  receipt,
  hasContactDetails,
  locale,
}: GrievanceConfirmationProps) {
  const t = useTranslations("grievance");

  return (
    <section aria-labelledby="grievance-confirmation-heading" className="lmcs-page-section">
      <div className="ux4g-context-alert ux4g-alert-success">
        <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">
          check_circle
        </span>
        <div className="ux4g-alert-content">
          <span className="ux4g-alert-title" id="grievance-confirmation-heading">
            {t("confirmation.heading")}
          </span>
          <span className="ux4g-alert-message">{t("confirmation.body")}</span>
        </div>
      </div>

      {/*
        The reference is the one thing a citizen must leave with, and they may
        be copying it off a phone in a shop — so it gets its own block at
        display size rather than sitting inline in a sentence.
      */}
      <div className="ux4g-card ux4g-card-outline lmcs-grievance-reference-card">
        <div className="ux4g-card-body">
          <p className="ux4g-label-l-default ux4g-text-neutral-secondary">
            {t("confirmation.referenceLabel")}
          </p>
          <p className="ux4g-heading-l-strong lmcs-grievance-reference">{receipt.reference}</p>
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {t("confirmation.referenceHelp")}
          </p>
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
            {t("confirmation.submittedAt", {
              date: new Date(receipt.submittedAt).toLocaleString(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
        </div>
      </div>

      <section aria-labelledby="grievance-next-heading" className="lmcs-page-section-block">
        <h3 id="grievance-next-heading" className="ux4g-title-s-strong">
          {t("confirmation.nextHeading")}
        </h3>
        <ol className="lmcs-grievance-next-list">
          <li className="ux4g-body-m-default">{t("confirmation.next1")}</li>
          <li className="ux4g-body-m-default">{t("confirmation.next2")}</li>
          <li className="ux4g-body-m-default">{t("confirmation.next3")}</li>
        </ol>

        {/* Additive only. Its absence says nothing about the report. */}
        {hasContactDetails ? (
          <p className="ux4g-body-s-default ux4g-text-neutral-secondary lmcs-measure">
            {t("confirmation.contactNote")}
          </p>
        ) : null}
      </section>
    </section>
  );
}
