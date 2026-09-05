"use client";

import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { usePermission } from "@/lib/hooks";

/**
 * QuickActions — the four shortcut buttons at the foot of the Dashboard.
 *
 * "Scan New Product" and "Scan E-commerce Listing" are gated on the single
 * `scan.create` permission via `usePermission` — the correct tool here,
 * unlike the Sidebar's list, which filters an array and would turn a
 * per-element hook into a hook-in-a-loop. Gating these matches what the
 * Sidebar already hides for the same reason: Reviewer cannot create scans.
 *
 * "View Records" and "Generate Report" stay visible for every role, matching
 * the Role Permission Matrix's "Generate reports" row (✅ for all three).
 */
export function QuickActions({
  labels,
}: {
  labels: {
    scanNewProduct: string;
    scanEcommerceListing: string;
    viewRecords: string;
    generateReport: string;
  };
}) {
  const canScan = usePermission("scan.create");

  return (
    <div className="lmcs-quick-actions">
      {canScan ? (
        <Link href={ROUTES.scan} className="ux4g-btn ux4g-btn-primary">
          <span className="ux4g-icon-outlined" aria-hidden="true">
            document_scanner
          </span>
          {labels.scanNewProduct}
        </Link>
      ) : null}

      {canScan ? (
        <Link href={ROUTES.ecommerce} className="ux4g-btn ux4g-btn-outline-primary">
          <span className="ux4g-icon-outlined" aria-hidden="true">
            shopping_cart
          </span>
          {labels.scanEcommerceListing}
        </Link>
      ) : null}

      <Link href={ROUTES.records} className="ux4g-btn ux4g-btn-outline-primary">
        <span className="ux4g-icon-outlined" aria-hidden="true">
          fact_check
        </span>
        {labels.viewRecords}
      </Link>

      <Link href={ROUTES.reports} className="ux4g-btn ux4g-btn-outline-primary">
        <span className="ux4g-icon-outlined" aria-hidden="true">
          summarize
        </span>
        {labels.generateReport}
      </Link>
    </div>
  );
}
