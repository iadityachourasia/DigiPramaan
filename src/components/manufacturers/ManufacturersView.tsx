"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { EmptyState, ErrorState, Skeleton } from "@/components/shared";
import { TextField } from "@/components/ui/TextField";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useManufacturers } from "@/lib/hooks";

import { ScorecardCard } from "./ScorecardCard";

/**
 * ManufacturersView — the scorecard list (09 §2).
 *
 * Search is client-side and synchronous. With seven manufacturers, a server
 * round trip and a debounce would be theatre; the whole set is already in
 * hand from the one page-level fetch.
 *
 * Sort is flagged-first, then by scan volume — the officer opening this page
 * is looking for repeat offenders, so the page shouldn't make them hunt.
 */
export function ManufacturersView({ locale }: { locale: string }) {
  const t = useTranslations("manufacturers");
  const searchParams = useSearchParams();
  const demoState = searchParams.get("demo") ?? undefined;
  const { scorecards, loading, error } = useManufacturers(demoState);
  const [query, setQuery] = useState("");

  if (error) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={t("errorBody")}
        action={
          <Link
            href={ROUTES.manufacturers}
            className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
          >
            {t("retryLabel")}
          </Link>
        }
      />
    );
  }

  const normalised = query.trim().toLowerCase();
  const visible = (scorecards ?? [])
    .filter((card) => card.summary.name.toLowerCase().includes(normalised))
    .sort((a, b) => {
      if (a.repeatViolationFlagged !== b.repeatViolationFlagged) {
        return a.repeatViolationFlagged ? -1 : 1;
      }
      return b.summary.totalProductsScanned - a.summary.totalProductsScanned;
    });

  return (
    <div className="lmcs-page-section">
      <section aria-labelledby="manufacturer-search-heading">
        <h2 id="manufacturer-search-heading" className="ux4g-sr-only">
          {t("search.heading")}
        </h2>
        <TextField
          id="manufacturer-search"
          label={t("search.label")}
          placeholder={t("search.placeholder")}
          leadingIcon="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </section>

      <section aria-labelledby="scorecard-grid-heading">
        <h2 id="scorecard-grid-heading" className="ux4g-sr-only">
          {t("grid.heading")}
        </h2>

        {loading ? (
          <div className="lmcs-scorecard-grid">
            <Skeleton height="10rem" />
            <Skeleton height="10rem" />
            <Skeleton height="10rem" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="search_off"
            title={normalised ? t("grid.noMatchTitle") : t("grid.emptyTitle")}
            description={normalised ? t("grid.noMatchBody") : t("grid.emptyBody")}
          />
        ) : (
          <div className="lmcs-scorecard-grid">
            {visible.map((scorecard) => (
              <ScorecardCard
                key={scorecard.summary.id}
                scorecard={scorecard}
                locale={locale}
                labels={{
                  productsScanned: t("card.productsScanned"),
                  complianceRate: t("card.complianceRate"),
                  lastScanned: t("card.lastScanned"),
                  never: t("card.never"),
                  repeatViolation: t("card.repeatViolation"),
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/*
        BRD R-02 / 09 §4's known limitation, stated on the page rather than
        buried in a type comment: manufacturer matching is exact, so two
        spellings of one company read as two manufacturers here and a repeat
        offender can be undercounted.
      */}
      <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
        {t("exactMatchNote")}
      </p>
    </div>
  );
}
