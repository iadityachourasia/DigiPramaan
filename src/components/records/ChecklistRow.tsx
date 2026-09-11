"use client";

import { useState } from "react";

import { explainViolation, type ExplanationOutput } from "@/lib/api/explanations";
import type { DeclarationCheck, FontSizeCheck } from "@/types";

/**
 * ChecklistRow — one finalized declaration line on Product Compliance
 * Detail (06-product-compliance-detail.md §2). Deliberately not
 * `FieldRow` (page 4's component): that one is bound to
 * `ExtractedDeclaration`/confidence bands and requires an `onCorrect`
 * callback — an edit affordance this read-only, finalized view has no use
 * for. This page's data (`DeclarationCheck`: fieldId/passed/value/
 * violationCategoryId/detail) is a different, simpler shape doing a
 * different job.
 *
 * A failed row's badge text is the taxonomy category name itself (e.g.
 * "MRP Non-Compliance"), not a generic "Fail" —06 §2's explicit
 * requirement. The full rule citation (with legal basis + detail) lives in
 * the Violation Summary, not duplicated here.
 *
 * Phase 6: an optional "Explain with AI" action on failed/review rows,
 * expanding an inline panel with the Gemini explanation — never a new
 * modal/drawer (none exists to reuse in this app). Only rendered when
 * `recordId` and `line.ruleId` are both present (real-backend records
 * only; mock data never has `ruleId` — see DeclarationCheck's own comment).
 *
 * Phase 7: an optional "View Evidence" action, shown when the rule
 * populated a real (non-null imageId+bbox) `line.evidence` — calls
 * `onViewEvidence` up to RecordDetailView, which switches the sibling
 * ImageViewer to the right angle and highlights the cited region. This
 * component has no image of its own to show; it only ever asks its parent.
 */

export interface ChecklistRowLabels {
  explainWithAi: string;
  explaining: string;
  explainError: string;
  summaryLabel: string;
  whatWasFoundLabel: string;
  whatIsMissingLabel: string;
  legalContextLabel: string;
  evidenceExplanationLabel: string;
  officerGuidanceLabel: string;
  insufficientContextNote: string;
  measuredHeightLabel: string;
  requiredHeightLabel: string;
  calibrationMethodLabel: string;
  confidenceLabel: string;
  resultLabel: string;
  viewEvidence: string;
}

export interface ChecklistRowProps {
  line: DeclarationCheck;
  fieldLabel: string;
  notDetectedLabel: string;
  passedLabel: string;
  /** Taxonomy category name — required when `line.passed` is false. */
  violationLabel?: string;
  recordId?: string;
  /** Phase 6 — Rule 7's real measurement, matched by fieldId. */
  fontSizeCheck?: FontSizeCheck;
  labels?: ChecklistRowLabels;
  /** Phase 7 — called with the cited image id + natural-pixel bbox. */
  onViewEvidence?: (imageId: string, bbox: [number, number, number, number]) => void;
}

export function ChecklistRow({
  line,
  fieldLabel,
  notDetectedLabel,
  passedLabel,
  violationLabel,
  recordId,
  fontSizeCheck,
  labels,
  onViewEvidence,
}: ChecklistRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationOutput | null>(null);

  const canExplain = !line.passed && Boolean(recordId) && Boolean(line.ruleId) && Boolean(labels);
  const evidenceImageId = line.evidence?.imageId;
  const evidenceBbox = line.evidence?.bbox;
  const canViewEvidence = Boolean(onViewEvidence) && Boolean(evidenceImageId) && Boolean(evidenceBbox) && Boolean(labels);

  async function handleExplain() {
    if (!recordId || !line.ruleId) return;
    setExpanded(true);
    if (explanation) return; // already fetched — don't re-call Gemini on a second click
    setLoading(true);
    setError(false);
    const result = await explainViolation(recordId, line.ruleId);
    setLoading(false);
    if (result.ok) setExplanation(result.data.explanation);
    else setError(true);
  }

  function handleViewEvidence() {
    if (!onViewEvidence || !evidenceImageId || !evidenceBbox) return;
    onViewEvidence(evidenceImageId, evidenceBbox);
  }

  return (
    <div className="ux4g-card ux4g-card-outline lmcs-checklist-row">
      <div className="lmcs-checklist-row-badge">
        {line.passed ? (
          <span className="ux4g-tag-tonal-success ux4g-tag-s">
            <span className="ux4g-icon-outlined" aria-hidden="true">
              check_circle
            </span>
            <span className="ux4g-label-s-default">{passedLabel}</span>
          </span>
        ) : (
          <span className="ux4g-tag-tonal-error ux4g-tag-s">
            <span className="ux4g-icon-outlined" aria-hidden="true">
              cancel
            </span>
            <span className="ux4g-label-s-default">{violationLabel}</span>
          </span>
        )}
      </div>
      <span className="ux4g-title-s-strong">{fieldLabel}</span>
      <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
        {line.value ?? notDetectedLabel}
      </span>

      {canExplain || canViewEvidence ? (
        <div className="lmcs-checklist-row-actions">
          {canViewEvidence ? (
            <button
              type="button"
              className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm lmcs-checklist-row-explain"
              onClick={handleViewEvidence}
            >
              <span className="ux4g-icon-outlined" aria-hidden="true">
                image_search
              </span>
              {labels!.viewEvidence}
            </button>
          ) : null}
          {canExplain ? (
            <button
              type="button"
              className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm lmcs-checklist-row-explain"
              onClick={handleExplain}
              disabled={loading}
            >
              <span className="ux4g-icon-outlined" aria-hidden="true">
                auto_awesome
              </span>
              {loading ? labels!.explaining : labels!.explainWithAi}
            </button>
          ) : null}
        </div>
      ) : null}

      {expanded && labels ? (
        <div className="lmcs-checklist-row-explanation ux4g-card ux4g-card-outline">
          {error ? (
            <p className="ux4g-body-s-default ux4g-text-error">{labels.explainError}</p>
          ) : null}
          {fontSizeCheck ? (
            <dl className="lmcs-checklist-row-measurement">
              <dt>{labels.measuredHeightLabel}</dt>
              <dd>{fontSizeCheck.measuredHeightMm.toFixed(2)}mm</dd>
              <dt>{labels.requiredHeightLabel}</dt>
              <dd>{fontSizeCheck.requiredHeightMm.toFixed(1)}mm</dd>
              <dt>{labels.calibrationMethodLabel}</dt>
              <dd>manual_two_point</dd>
              <dt>{labels.resultLabel}</dt>
              <dd>{fontSizeCheck.passed ? passedLabel : violationLabel}</dd>
            </dl>
          ) : null}
          {explanation ? (
            <div className="lmcs-checklist-row-explanation-body">
              {explanation.insufficientContext ? (
                <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
                  {labels.insufficientContextNote}
                </p>
              ) : null}
              <p>
                <strong>{labels.summaryLabel}: </strong>
                {explanation.summary}
              </p>
              <p>
                <strong>{labels.whatWasFoundLabel}: </strong>
                {explanation.whatWasFound}
              </p>
              <p>
                <strong>{labels.whatIsMissingLabel}: </strong>
                {explanation.whatIsMissingOrWrong}
              </p>
              <p>
                <strong>{labels.legalContextLabel}: </strong>
                {explanation.legalContext}
              </p>
              <p>
                <strong>{labels.evidenceExplanationLabel}: </strong>
                {explanation.evidenceExplanation}
              </p>
              <p>
                <strong>{labels.officerGuidanceLabel}: </strong>
                {explanation.officerGuidance}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
