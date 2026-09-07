"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { useGrievanceForm } from "@/lib/hooks";

import { GrievanceConfirmation } from "./GrievanceConfirmation";
import { GrievanceForm } from "./GrievanceForm";
import { GrievanceStatusLookupPanel } from "./GrievanceStatusLookupPanel";

/**
 * GrievanceView — client orchestrator for the Citizen Grievance Portal
 * (page 11).
 *
 * The only page in this product with no authenticated session behind it. It
 * calls no `useAuth`, gates nothing on a role, and its submission carries no
 * user id — see `grievance-store.ts` for what the record is attributed to
 * instead.
 *
 * Once a report is submitted the form is replaced by its confirmation rather
 * than sitting emptied below it: the citizen is done, and 11 §3 ends the flow
 * at the reference. The status lookup stays available either way, since
 * someone may arrive only to check an earlier report.
 */
export function GrievanceView({ locale }: { locale: string }) {
  const t = useTranslations("grievance");
  const searchParams = useSearchParams();
  const demoState = searchParams.get("demo") ?? undefined;
  const form = useGrievanceForm(demoState);

  const hasContactDetails = Boolean(
    form.fields.submitterName.trim() || form.fields.submitterContact.trim()
  );

  return (
    <div className="lmcs-page-section">
      {form.receipt ? (
        <GrievanceConfirmation
          receipt={form.receipt}
          hasContactDetails={hasContactDetails}
          locale={locale}
        />
      ) : (
        <section aria-labelledby="grievance-form-heading" className="lmcs-page-section-block">
          <h2 id="grievance-form-heading" className="ux4g-heading-m-strong">
            {t("form.heading")}
          </h2>
          <GrievanceForm form={form} />
        </section>
      )}

      <GrievanceStatusLookupPanel locale={locale} />
    </div>
  );
}
