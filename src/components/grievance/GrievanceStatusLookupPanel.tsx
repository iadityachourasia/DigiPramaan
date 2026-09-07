"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { TextField } from "@/components/ui/TextField";
import { useGrievanceLookup } from "@/lib/hooks";
import { normalizeShortCode } from "@/lib/utils/shortCode";

/**
 * GrievanceStatusLookupPanel — "check your report status" (page 11 §2).
 *
 * Shows only the coarse three-value public label and a date. The mapping from
 * internal state lives in `grievance-store.ts`; the important property from
 * this side is what is absent — no Compliance Status, no officer name, no rule
 * citation, and no distinction between a compliant and a non-compliant
 * outcome. 11 §2: "never exposes internal officer workflow detail".
 *
 * The not-found message is identical whether the reference never existed or is
 * simply malformed, so the field cannot be used to probe which references are
 * real.
 */

export interface GrievanceStatusLookupPanelProps {
  locale: string;
}

export function GrievanceStatusLookupPanel({ locale }: GrievanceStatusLookupPanelProps) {
  const t = useTranslations("grievance");
  const tVocab = useTranslations("vocabulary");
  const lookup = useGrievanceLookup();
  const [reference, setReference] = useState("");

  return (
    <section aria-labelledby="grievance-track-heading" className="lmcs-page-section-block">
      <h2 id="grievance-track-heading" className="ux4g-heading-m-strong">
        {t("lookup.heading")}
      </h2>
      <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
        {t("lookup.help")}
      </p>

      <form
        className="lmcs-grievance-lookup-row"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void lookup.search(reference);
        }}
      >
        <TextField
          id="grievance-reference"
          label={t("lookup.label")}
          hint={t("lookup.hint")}
          placeholder="LM-XXXXXX"
          value={reference}
          /* The alphabet is uppercase-only, so normalise as the citizen types. */
          onChange={(event) => setReference(normalizeShortCode(event.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
        {/*
          `-lg` for the 48px height. The package default button is 40px, under
          the 44px floor A-09 sets, and 11 section 5 is explicit that touch
          targets matter more on a public page, not less — this is someone on a
          phone in a shop aisle. The app-wide default height is a separate,
          pre-existing gap.
        */}
        <button
          type="submit"
          className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-lg"
          disabled={lookup.searching || !reference.trim()}
        >
          {lookup.searching ? t("lookup.searching") : t("lookup.search")}
        </button>
      </form>

      {lookup.notFound ? (
        <Alert severity="warning" title={t("lookup.notFoundTitle")}>
          {t("lookup.notFoundBody")}
        </Alert>
      ) : null}

      {lookup.result ? (
        <div className="ux4g-card ux4g-card-outline lmcs-grievance-status-card">
          <div className="ux4g-card-body">
            <p className="ux4g-label-l-default ux4g-text-neutral-secondary">
              {lookup.result.reference}
            </p>
            <p className="ux4g-heading-m-strong">
              {tVocab(`publicGrievanceStatus.${lookup.result.status}`)}
            </p>
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
              {t("lookup.lastUpdated", {
                date: new Date(lookup.result.lastUpdatedAt).toLocaleString(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}
            </p>
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary lmcs-measure">
              {t(`lookup.explain.${lookup.result.status}`)}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
