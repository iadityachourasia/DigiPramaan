"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/shared";
import { Link } from "@/i18n/navigation";
import { fetchBatch } from "@/lib/api/ecommerce";
import { ROUTES } from "@/lib/constants";
import type { EcommerceBatch } from "@/types";

import { BatchQueueTable } from "./BatchQueueTable";

/** Batch state is server-derived, so this just polls until nothing is still in flight. */
const POLL_INTERVAL_MS = 800;

export interface BatchViewProps {
  batchId: string;
}

/**
 * BatchView — one bulk batch's queue (08 §4). Each listing's status is
 * derived server-side from its own independent pipeline run, so this only
 * has to render and poll: an officer who navigates away mid-batch and
 * comes back to this URL sees accurate progress, and one listing failing
 * neither blocks nor hides the rest.
 */
export function BatchView({ batchId }: BatchViewProps) {
  const t = useTranslations("ecommerce");
  const [batch, setBatch] = useState<EcommerceBatch | null>(null);
  const [scanIds, setScanIds] = useState<Record<string, string>>({});
  const [notFound, setNotFound] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function poll() {
      fetchBatch(batchId).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setNotFound(true);
          return;
        }
        setBatch(result.data.batch);
        setScanIds(result.data.scanIds);
        const stillRunning = result.data.batch.listings.some(
          (listing) => listing.status === "scanning" || listing.status === "queued"
        );
        if (!stillRunning) setSettled(true);
      });
    }

    poll();
    if (settled) return;
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [batchId, settled]);

  if (notFound) {
    return (
      <EmptyState icon="search_off" title={t("batch.notFoundTitle")} description={t("batch.notFoundBody")} />
    );
  }

  if (!batch) {
    return (
      <div className="ux4g-upload-content" role="status">
        <span className="ux4g-spinner ux4g-spinner-sm" aria-hidden="true" />
      </div>
    );
  }

  const doneCount = batch.listings.filter((listing) => listing.status === "done").length;
  const failedCount = batch.listings.filter((listing) => listing.status === "failed").length;

  return (
    <div className="lmcs-page-section">
      <div className="lmcs-batch-summary">
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
          {t("batch.sourceUrl")}: {batch.sourceUrl}
        </p>
        <p className="ux4g-body-s-default">
          {t("batch.progress", {
            done: doneCount,
            failed: failedCount,
            total: batch.listings.length,
          })}
        </p>
      </div>

      <BatchQueueTable
        listings={batch.listings}
        scanIds={scanIds}
        selectedIds={new Set()}
        onToggleRow={() => undefined}
        onToggleAll={() => undefined}
        selectable={false}
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

      <div className="lmcs-batch-actions">
        {/* 08 §4 step 6 — the completed batch's records, filtered to this batch. */}
        <Link
          href={`${ROUTES.records}?batchIds=${encodeURIComponent(batch.id)}`}
          className="ux4g-btn ux4g-btn-primary"
        >
          {t("batch.viewInRecords")}
        </Link>
        <Link href={ROUTES.ecommerce} className="ux4g-btn ux4g-btn-text-primary">
          {t("batch.backToScanner")}
        </Link>
      </div>
    </div>
  );
}
