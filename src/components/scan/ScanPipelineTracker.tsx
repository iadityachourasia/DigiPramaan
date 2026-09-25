"use client";

import { motion } from "framer-motion";

import { useIsTabletOrAbove, usePrefersReducedMotion } from "@/lib/hooks";
import type { PipelineStage, PipelineStageId } from "@/types";

/**
 * ScanPipelineTracker — horizontal Status Pipeline for the scan progress
 * page redesign. A sibling of `PipelineTracker.tsx` (left unchanged, an
 * explicit scope cut), not a fork of it in place: this version orients
 * horizontally on tablet/desktop (real `ux4g-status-pipeline-horizontal`,
 * confirmed against the compiled stylesheet) and flips to the existing
 * vertical variant below 1024px via `useIsTabletOrAbove()` — one component,
 * one orientation variable, matching `DESIGN_SYSTEM.md`'s confirmed
 * breakpoints.
 *
 * The literal fix for "only green dots": every pending stage now renders a
 * real, stage-specific Material Symbol instead of an empty circle, so the
 * whole run is legible before anything has started.
 */

const STAGE_ICON: Record<PipelineStageId, string> = {
  uploading: "cloud_upload",
  qualityCheck: "verified",
  textExtraction: "document_scanner",
  fallbackExtraction: "auto_awesome",
  barcodeDetection: "barcode_scanner",
  structuring: "schema",
  ruleEngine: "gavel",
  complianceScore: "insights",
  readyForVerification: "task_alt",
};

export interface ScanPipelineTrackerProps {
  stages: readonly PipelineStage[];
  onRetry: (stageId: PipelineStageId) => void;
  labels: {
    stageLabel: (stageId: PipelineStageId) => string;
    skipped: string;
    retry: string;
    inProgress: string;
    pending: string;
    completed: string;
    failed: string;
  };
}

export function ScanPipelineTracker({ stages, onRetry, labels }: ScanPipelineTrackerProps) {
  const reduceMotion = usePrefersReducedMotion();
  const isTabletOrAbove = useIsTabletOrAbove();

  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.28, ease: "easeOut" as const },
      };

  const orientationClass = isTabletOrAbove
    ? "ux4g-status-pipeline-horizontal"
    : "ux4g-status-pipeline-vertical";

  return (
    <ol className={`ux4g-status-pipeline-stepper ${orientationClass} lmcs-scan-pipeline-tracker`}>
      {stages.map((stage) => {
        const done = stage.state === "completed" || stage.state === "skipped";
        const hasSummary = done || stage.state === "failed";

        return (
          <li
            key={stage.id}
            className={`ux4g-status-pipeline-step${done ? " ux4g-status-pipeline-done" : ""}${
              stage.state === "pending" ? " ux4g-status-pipeline-step-pending" : ""
            }`}
            aria-current={stage.state === "in_progress" ? "step" : undefined}
          >
            <div className="ux4g-status-pipeline-head">
              <span
                className={`ux4g-status-pipeline-head-icon${
                  stage.state === "failed" ? " lmcs-pipeline-stage-failed" : ""
                }`}
                aria-hidden="true"
              >
                {done ? (
                  <span className="ux4g-status-pipeline-head-check" />
                ) : stage.state === "in_progress" ? (
                  <span className="ux4g-spinner ux4g-spinner-sm" />
                ) : stage.state === "failed" ? (
                  <span className="ux4g-icon-outlined">error</span>
                ) : (
                  <span className="ux4g-icon-outlined lmcs-pipeline-stage-pending-icon">
                    {STAGE_ICON[stage.id]}
                  </span>
                )}
              </span>
            </div>

            <span className="ux4g-status-pipeline-label">
              {stage.state === "skipped"
                ? `${labels.stageLabel(stage.id)} — ${labels.skipped}`
                : labels.stageLabel(stage.id)}
              <span className="ux4g-sr-only">
                {" "}
                {stage.state === "completed"
                  ? labels.completed
                  : stage.state === "skipped"
                    ? labels.skipped
                    : stage.state === "in_progress"
                      ? labels.inProgress
                      : stage.state === "failed"
                        ? labels.failed
                        : labels.pending}
              </span>
            </span>

            {hasSummary && stage.summary ? (
              <motion.p
                className="ux4g-status-pipeline-description"
                style={{ gridColumn: 2 }}
                {...reveal}
              >
                {stage.summary}
              </motion.p>
            ) : null}

            {stage.state === "failed" ? (
              <motion.div
                className="lmcs-pipeline-stage-actions"
                style={{ gridRow: 3 }}
                {...reveal}
              >
                <p className="ux4g-upload-error-msg" role="alert">
                  <span className="ux4g-icon-outlined" aria-hidden="true">error</span>
                  {stage.failureReason}
                </p>
                <button
                  type="button"
                  className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
                  onClick={() => onRetry(stage.id)}
                >
                  <span className="ux4g-icon-outlined" aria-hidden="true">replay</span>
                  {labels.retry}
                </button>
              </motion.div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
