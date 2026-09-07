"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/shared";
import { Alert } from "@/components/ui/Alert";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useRouter } from "@/i18n/navigation";
import {
  createBatch as createBatchRequest,
  scanListing as scanListingRequest,
  scrapeUrl,
  type ScrapeFailure,
} from "@/lib/api/ecommerce";
import { ROUTES } from "@/lib/constants";
import { useAuth, usePermission } from "@/lib/hooks";
import { INSPECTION_REGIONS } from "@/lib/mock";
import {
  PRODUCT_CATEGORIES,
  type EcommerceScanMode,
  type ProductCategory,
  type ScrapedListing,
} from "@/types";

import { BatchQueueTable } from "./BatchQueueTable";
import { ListingPreview } from "./ListingPreview";

/**
 * EcommerceView — client orchestrator for the E-commerce Listing Scanner
 * (page 8). Produces the same pipeline input a physically captured scan
 * does and hands it to the same pipeline (08 §2's "Pipeline Reuse"), so
 * nothing about extraction is re-implemented here.
 *
 * Category and region are collected on this page because `ScanMetadata`
 * requires both and a scrape knows neither — the spec's field list doesn't
 * name them, but the pipeline cannot run without them. In bulk mode one
 * choice applies to the whole batch rather than asking per listing.
 */
export function EcommerceView() {
  const t = useTranslations("ecommerce");
  const router = useRouter();
  const { user } = useAuth();
  const canScan = usePermission("scan.create");

  const [mode, setMode] = useState<EcommerceScanMode>("single");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<ProductCategory>("Packaged Food");
  const [region, setRegion] = useState<string>(INSPECTION_REGIONS[0]);

  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ScrapeFailure | null>(null);
  const [listing, setListing] = useState<ScrapedListing | null>(null);
  const [listings, setListings] = useState<ScrapedListing[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (!canScan) {
    return <EmptyState icon="block" title={t("noAccessTitle")} description={t("noAccessBody")} />;
  }

  function resetResults() {
    setFailure(null);
    setListing(null);
    setListings(null);
    setSelectedIds(new Set());
  }

  function switchMode(next: EcommerceScanMode) {
    setMode(next);
    setUrl("");
    resetResults();
  }

  async function handleFetch() {
    resetResults();
    setFetching(true);
    const result = await scrapeUrl(url, mode);
    setFetching(false);

    if (!result.ok) {
      setFailure("invalid_url");
      return;
    }
    if (!result.data.ok) {
      setFailure(result.data.failure ?? "unrecognized");
      return;
    }

    if (mode === "single") {
      setListing(result.data.listing ?? null);
    } else {
      const found = result.data.listings ?? [];
      setListings(found);
      /* Everything found starts selected — deselecting the irrelevant few
         is less work than selecting the relevant many (08 §4 step 3). */
      setSelectedIds(new Set(found.map((item) => item.id)));
    }
  }

  async function handleScanListing() {
    if (!listing || !user) return;
    setSubmitting(true);
    const result = await scanListingRequest(
      listing,
      { category, region, productName: listing.title, ecommerceListingUrl: listing.listingUrl },
      user.id
    );
    setSubmitting(false);
    if (result.ok) router.push(ROUTES.scanStatus(result.data.scanId));
  }

  async function handleScanSelected() {
    if (!listings || !user || selectedIds.size === 0) return;
    setSubmitting(true);
    const result = await createBatchRequest(url, listings, [...selectedIds], { category, region }, user.id);
    setSubmitting(false);
    if (result.ok) router.push(ROUTES.ecommerceBatch(result.data.id));
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      const all = listings ?? [];
      const allSelected = all.length > 0 && all.every((item) => prev.has(item.id));
      return allSelected ? new Set() : new Set(all.map((item) => item.id));
    });
  }

  return (
    <div className="lmcs-page-section">
      <div className="lmcs-ecommerce-mode" role="group" aria-label={t("modeLabel")}>
        <button
          type="button"
          className={`ux4g-btn ux4g-btn-sm ${mode === "single" ? "ux4g-btn-primary" : "ux4g-btn-outline-primary"}`}
          aria-pressed={mode === "single"}
          onClick={() => switchMode("single")}
        >
          {t("mode.single")}
        </button>
        <button
          type="button"
          className={`ux4g-btn ux4g-btn-sm ${mode === "bulk" ? "ux4g-btn-primary" : "ux4g-btn-outline-primary"}`}
          aria-pressed={mode === "bulk"}
          onClick={() => switchMode("bulk")}
        >
          {t("mode.bulk")}
        </button>
      </div>

      {/* 08 §7's Definition of Done: the scope note distinguishing this page
          from page 3's optional e-commerce URL field must be visible in the UI. */}
      <Alert severity="info" title={t("scopeNote.title")}>
        {t("scopeNote.body")}
      </Alert>

      <section aria-labelledby="ecommerce-input-heading" className="ux4g-card ux4g-card-outline">
        <div className="ux4g-card-body lmcs-page-section-block">
          <h2 id="ecommerce-input-heading" className="ux4g-title-m-strong">
            {mode === "single" ? t("single.heading") : t("bulk.heading")}
          </h2>

          <div className="lmcs-ecommerce-input-row">
            <TextField
              id="ecommerce-url"
              label={mode === "single" ? t("single.urlLabel") : t("bulk.urlLabel")}
              hint={mode === "single" ? t("single.urlHint") : t("bulk.urlHint")}
              placeholder="https://marketplace.example.in/…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Select
              id="ecommerce-category"
              label={t("categoryLabel")}
              options={PRODUCT_CATEGORIES.map((value) => ({ label: value, value }))}
              value={category}
              onChange={(event) => setCategory(event.target.value as ProductCategory)}
            />
            <Select
              id="ecommerce-region"
              label={t("regionLabel")}
              options={INSPECTION_REGIONS.map((value) => ({ label: value, value }))}
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="ux4g-btn ux4g-btn-outline-primary"
            onClick={handleFetch}
            disabled={!url || fetching}
          >
            {fetching ? t("fetching") : t("fetch")}
          </button>
        </div>
      </section>

      {failure ? (
        <Alert severity="error" title={t(`failure.${failure}.title`)}>
          {t(`failure.${failure}.body`)}
        </Alert>
      ) : null}

      {mode === "single" && listing ? (
        <section aria-labelledby="ecommerce-preview-heading" className="lmcs-page-section-block">
          <h2 id="ecommerce-preview-heading" className="ux4g-title-m-strong">
            {t("preview.heading")}
          </h2>
          <ListingPreview
            listing={listing}
            labels={{ heading: t("preview.heading"), sourceUrlLabel: t("preview.sourceUrl") }}
          />
          <button
            type="button"
            className="ux4g-btn ux4g-btn-primary"
            onClick={handleScanListing}
            disabled={submitting}
          >
            {submitting ? t("single.scanning") : t("single.scanAction")}
          </button>
        </section>
      ) : null}

      {mode === "bulk" && listings ? (
        <section aria-labelledby="ecommerce-queue-heading" className="lmcs-page-section-block">
          <h2 id="ecommerce-queue-heading" className="ux4g-title-m-strong">
            {t("bulk.queueHeading")}
          </h2>
          <div className="lmcs-ecommerce-bulk-bar">
            <span className="ux4g-body-s-default">
              {t("bulk.selectedCount", { count: selectedIds.size, total: listings.length })}
            </span>
            <button
              type="button"
              className="ux4g-btn ux4g-btn-primary ux4g-btn-sm"
              onClick={handleScanSelected}
              disabled={selectedIds.size === 0 || submitting}
            >
              {submitting ? t("bulk.scanning") : t("bulk.scanAction")}
            </button>
          </div>
          <BatchQueueTable
            listings={listings}
            scanIds={{}}
            selectedIds={selectedIds}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            selectable
            labels={{
              caption: t("bulk.queueHeading"),
              columnThumbnail: t("bulk.columnListing"),
              columnTitle: t("bulk.columnListing"),
              columnStatus: t("bulk.columnStatus"),
              columnAction: t("bulk.columnAction"),
              selectAll: t("bulk.selectAll"),
              selectRow: (title) => t("bulk.selectRow", { title }),
              statusLabel: (status) => t(`status.${status}`),
              viewProgress: t("bulk.viewProgress"),
              viewRecord: t("bulk.viewRecord"),
              emptyTitle: t("failure.empty.title"),
              emptyBody: t("failure.empty.body"),
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
