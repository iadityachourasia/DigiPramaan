"use client";

import { motion } from "framer-motion";

import { usePrefersReducedMotion } from "@/lib/hooks";
import type { PipelineStage, PipelineStageId } from "@/types";

/**
 * PipelineTracker — the Processing Pipeline Tracker (03-scan-upload.md §2
 * Step 5). Vertical, 8 stages, each pending/in-progress/completed/skipped/
 * failed.
 *
 * Built from the real `ux4g-status-pipeline`/`-vertical` classes confirmed
 * against the compiled stylesheet (359 rules) — the same family
 * `WizardProgress.tsx` already uses successfully as `ux4g-stepper` (they
 * share head/head-icon/head-check/done/step-pending sub-structure), just the
 * vertical orientation.
 *
 * The real vertical layout is a CSS grid on `.ux4g-status-pipeline-step`
 * itself (`grid-template-columns: 40px 1fr; grid-template-rows: auto auto
 * auto`), with `.ux4g-status-pipeline-head` pinned to column 1 and — this is
 * the part easy to get wrong without reading the actual rules — direct
 * `<span>` children of the step (not a wrapping content `<div>`) placed into
 * column 2: label in row 1 by default flow, `.ux4g-status-pipeline-description`
 * explicitly in row 2, and the step's last child explicitly in row 3. The
 * retry block below sets its own `gridRow` inline rather than depending on
 * the tag-qualified `:last-child` selector matching a non-`<span>` element.
 *
 * Two things the real component has no class for, composed around rather
 * than forked, the same limitation already solved elsewhere on this page:
 *   - no literal "skipped"/"failed" state — skipped renders `-done` with its
 *     label suffixed "— Skipped"; failed gets a small `lmcs-pipeline-stage-
 *     failed` treatment from confirmed real error tokens, not a guessed
 *     nested-class dependency I can't verify statically
 *   - no per-stage action slot — the retry button is composed directly
 *     below that one stage's summary
 */

export interface PipelineTrackerProps {
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

export function PipelineTracker({ stages, onRetry, labels }: PipelineTrackerProps) {
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
                ) : null}
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
              <motion.p className="ux4g-status-pipeline-description" {...reveal}>
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
