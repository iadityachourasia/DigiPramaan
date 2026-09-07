"use client";

import { motion } from "framer-motion";

import { usePrefersReducedMotion } from "@/lib/hooks";
import type { ReportStage, ReportStageId } from "@/types";

/**
 * ReportProgressTracker — generation progress (10 §2, §4).
 *
 * 10 §5 asks that "progress and completion states reuse the same
 * status/progress visual pattern as the Scan/Upload page", so this uses the
 * identical `ux4g-status-pipeline-vertical` composition `PipelineTracker`
 * established, including the two non-obvious constraints that file documents:
 * the step is itself a CSS grid, and direct `<span>` children land in column
 * two, so the failure block sets its own `gridRow` rather than relying on a
 * tag-qualified `:last-child` selector matching a `<div>`.
 *
 * A sibling rather than a reuse of `PipelineTracker` itself, which is typed
 * to `PipelineStageId`. Widening that union would put report stages inside
 * the scan pipeline's type, where they mean nothing.
 */

export interface ReportProgressTrackerProps {
  stages: readonly ReportStage[];
  onRetry: (stageId: ReportStageId) => void;
  labels: {
    stageLabel: (stageId: ReportStageId) => string;
    retry: string;
    pending: string;
    inProgress: string;
    completed: string;
    failed: string;
  };
}

export function ReportProgressTracker({ stages, onRetry, labels }: ReportProgressTrackerProps) {
  const reduceMotion = usePrefersReducedMotion();

  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.28, ease: "easeOut" as const },
      };

  return (
    <ol className="ux4g-status-pipeline-vertical lmcs-pipeline-tracker">
      {stages.map((stage) => (
        <li
          key={stage.id}
          className={`ux4g-status-pipeline-step${
            stage.state === "completed" ? " ux4g-status-pipeline-done" : ""
          }${stage.state === "pending" ? " ux4g-status-pipeline-step-pending" : ""}`}
          aria-current={stage.state === "in_progress" ? "step" : undefined}
        >
          <div className="ux4g-status-pipeline-head">
            <span
              className={`ux4g-status-pipeline-head-icon${
                stage.state === "failed" ? " lmcs-pipeline-stage-failed" : ""
              }`}
              aria-hidden="true"
            >
              {stage.state === "completed" ? (
                <span className="ux4g-status-pipeline-head-check" />
              ) : stage.state === "in_progress" ? (
                <span className="ux4g-spinner ux4g-spinner-sm" />
              ) : stage.state === "failed" ? (
                <span className="ux4g-icon-outlined">error</span>
              ) : null}
            </span>
          </div>

          <span className="ux4g-status-pipeline-label">
            {labels.stageLabel(stage.id)}
            {/* The visual state is an icon, so the state word is spelled out for
                assistive tech rather than signalled by colour alone (A-10). */}
            <span className="ux4g-sr-only">
              {" "}
              {stage.state === "completed"
                ? labels.completed
                : stage.state === "in_progress"
                  ? labels.inProgress
                  : stage.state === "failed"
                    ? labels.failed
                    : labels.pending}
            </span>
          </span>

          {stage.summary && stage.state === "completed" ? (
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
                <span className="ux4g-icon-outlined" aria-hidden="true">
                  error
                </span>
                {stage.failureReason}
              </p>
              <button
                type="button"
                className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm"
                onClick={() => onRetry(stage.id)}
              >
                <span className="ux4g-icon-outlined" aria-hidden="true">
                  replay
                </span>
                {labels.retry}
              </button>
            </motion.div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
