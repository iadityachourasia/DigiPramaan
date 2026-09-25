"use client";

import { useState } from "react";

import type { PipelineStage, PipelineStageId } from "@/types";

const COLLAPSED_COUNT = 3;

export interface ScanStageHistoryProps {
  stages: readonly PipelineStage[];
  labels: {
    historyHeading: string;
    showFullHistory: string;
    stageLabel: (stageId: PipelineStageId) => string;
    stageDuration: (seconds: number) => string;
    failed: string;
  };
}

function durationSeconds(stage: PipelineStage): number | null {
  if (!stage.startedAt || !stage.completedAt) return null;
  const ms = new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime();
  return ms >= 0 ? Math.round(ms / 1000) : null;
}

/**
 * ScanStageHistory — the collapsed Journey Timeline of the Application
 * Tracker composition (`PAGE_COMPOSITION.md` §6): only completed/skipped/
 * failed stages appear here (the current/pending stages are already the
 * loud, primary element in `ScanPipelineTracker`). Collapsed to the last
 * `COLLAPSED_COUNT` entries by default per that doc's explicit warning
 * against burying the thing the user came for under history they don't
 * need yet. Durations shown are real, measured `completedAt - startedAt`
 * — no "(estimated)" qualifier needed here, unlike `ScanProgressIndicator`.
 */
export function ScanStageHistory({ stages, labels }: ScanStageHistoryProps) {
  const [expanded, setExpanded] = useState(false);

  const history = stages.filter(
    (s) => s.state === "completed" || s.state === "skipped" || s.state === "failed"
  );
  if (history.length === 0) return null;

  const visible = expanded ? history : history.slice(-COLLAPSED_COUNT);

  return (
    <section className="lmcs-scan-stage-history">
      <h2 className="ux4g-heading-s-default">{labels.historyHeading}</h2>

      <ol className="ux4g-journey-timeline ux4g-journey-timeline--vertical">
        {visible.map((stage) => {
          const seconds = durationSeconds(stage);
          const stepClass =
            stage.state === "failed" ? "" : " ux4g-journey-step-completed";

          return (
            <li key={stage.id} className={`ux4g-journey-step${stepClass}`}>
              <span className="ux4g-journey-indicator" aria-hidden="true">
                <span className="ux4g-icon-outlined">
                  {stage.state === "failed" ? "error" : "check"}
                </span>
              </span>
              <div className="ux4g-journey-card ux4g-journey-card--condensed">
                <div className="ux4g-journey-info">
                  <div className="ux4g-journey-header-row">
                    <p className="ux4g-journey-title">{labels.stageLabel(stage.id)}</p>
                    {stage.completedAt ? (
                      <span className="ux4g-journey-date">
                        {new Date(stage.completedAt).toLocaleTimeString()}
                      </span>
                    ) : null}
                  </div>
                  {stage.state === "failed" ? (
                    <p className="ux4g-journey-description">
                      {labels.failed}
                      {stage.failureReason ? ` — ${stage.failureReason}` : ""}
                    </p>
                  ) : seconds !== null ? (
                    <p className="ux4g-journey-description">{labels.stageDuration(seconds)}</p>
                  ) : stage.summary ? (
                    <p className="ux4g-journey-description">{stage.summary}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {history.length > COLLAPSED_COUNT ? (
        <button
          type="button"
          className="ux4g-sla-linear-action"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {labels.showFullHistory}
        </button>
      ) : null}
    </section>
  );
}
