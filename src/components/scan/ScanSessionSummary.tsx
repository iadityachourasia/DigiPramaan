"use client";

import { useElapsedTime } from "@/lib/hooks";
import type { PipelineRun } from "@/types";

export interface ScanSessionSummaryProps {
  run: PipelineRun;
  paused: boolean;
  labels: {
    sessionId: string;
    category: string;
    region: string;
    source: string;
    elapsedLabel: string;
    sourceValue: (source: PipelineRun["source"]) => string;
  };
}

/**
 * ScanSessionSummary — the "application summary" band of the Application
 * Tracker composition (`PAGE_COMPOSITION.md` §6): session id, category,
 * region, source, and a real ticking elapsed-time clock. Every value here
 * is either a real identifier or a real backend timestamp — never a
 * fabricated number.
 */
export function ScanSessionSummary({ run, paused, labels }: ScanSessionSummaryProps) {
  const elapsed = useElapsedTime(run.createdAt, paused);

  const rows: Array<{ label: string; value: string }> = [
    { label: labels.sessionId, value: run.scanId },
  ];
  if (run.category) rows.push({ label: labels.category, value: run.category });
  if (run.region) rows.push({ label: labels.region, value: run.region });
  rows.push({ label: labels.source, value: labels.sourceValue(run.source) });

  return (
    <div className="lmcs-scan-session-summary ux4g-card">
      <dl className="lmcs-scan-session-summary-grid">
        {rows.map((row) => (
          <div key={row.label} className="lmcs-scan-session-summary-item">
            <dt className="ux4g-label-s-default">{row.label}</dt>
            <dd className="ux4g-body-m-default">{row.value}</dd>
          </div>
        ))}
        {elapsed ? (
          <div className="lmcs-scan-session-summary-item">
            <dt className="ux4g-label-s-default">{labels.elapsedLabel}</dt>
            <dd className="ux4g-body-m-default" role="timer" aria-live="off">
              <span className="ux4g-icon-outlined" aria-hidden="true">schedule</span>
              {elapsed}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
