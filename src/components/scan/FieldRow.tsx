"use client";

import { motion } from "framer-motion";
import type { FocusEvent } from "react";

import { TextField } from "@/components/ui/TextField";
import { usePrefersReducedMotion } from "@/lib/hooks";
import type { DeclarationFieldId, ExtractedDeclaration } from "@/types";

import { ConfidenceBadge } from "./ConfidenceBadge";
import { FieldSourceBadges } from "./FieldSourceBadges";

/**
 * FieldRow — one declaration field (04-extraction-verification.md §3).
 *
 * Correction affordance: inline edit-in-place, always available — the spec
 * is explicit that "every extracted field is editable inline", so there is
 * no separate edit-mode toggle. `key={declaration.value}` on the input
 * forces it to pick up a server-confirmed value after a correction or a
 * retry, while ordinary typing between blurs stays uncontrolled — this
 * avoids fighting a controlled input against every keystroke for a page
 * this dense.
 */

export interface FieldRowProps {
  fieldId: DeclarationFieldId;
  declaration: ExtractedDeclaration;
  readOnly: boolean;
  onCorrect: (fieldId: DeclarationFieldId, value: string) => void;
  onViewImage: () => void;
  labels: {
    fieldLabel: string;
    legalBasis: string;
    notDetected: string;
    corrected: string;
    confidenceLabel: string;
    sourceAngleLabel: (angle: ExtractedDeclaration["sourceImageAngle"]) => string;
    sourceEngineLabel: (engine: ExtractedDeclaration["sourceEngine"]) => string;
    viewImage: string;
  };
}

export function FieldRow({
  fieldId,
  declaration,
  readOnly,
  onCorrect,
  onViewImage,
  labels,
}: FieldRowProps) {
  const reduceMotion = usePrefersReducedMotion();

  const correctedReveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, scale: 0.9 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.22, ease: "easeOut" as const },
      };

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    if (readOnly) return;
    const next = event.target.value;
    if (next !== (declaration.value ?? "")) {
      onCorrect(fieldId, next);
    }
  }

  return (
    <div className="ux4g-card ux4g-card-outline lmcs-field-row">
      <div className="lmcs-field-row-badges">
        {declaration.notDetected ? (
          <span className="ux4g-tag-tonal-error ux4g-tag-s">
            <span className="ux4g-icon-outlined" aria-hidden="true">
              error
            </span>
            <span className="ux4g-label-s-default">{labels.notDetected}</span>
          </span>
        ) : (
          <ConfidenceBadge
            band={declaration.band}
            percentage={declaration.confidence}
            label={labels.confidenceLabel}
          />
        )}

        {declaration.corrected ? (
          <motion.span className="ux4g-tag-tonal-info ux4g-tag-s" {...correctedReveal}>
            <span className="ux4g-icon-outlined" aria-hidden="true">
              check
            </span>
            <span className="ux4g-label-s-default">{labels.corrected}</span>
          </motion.span>
        ) : null}

        <FieldSourceBadges
          sourceImageAngle={declaration.sourceImageAngle}
          sourceEngine={declaration.sourceEngine}
          labels={{
            angle: labels.sourceAngleLabel,
            engine: labels.sourceEngineLabel,
            viewImage: labels.viewImage,
          }}
          onViewImage={onViewImage}
        />
      </div>

      <TextField
        key={declaration.value ?? ""}
        id={`field-${fieldId}`}
        label={labels.fieldLabel}
        hint={labels.legalBasis}
        defaultValue={declaration.value ?? ""}
        disabled={readOnly}
        onBlur={handleBlur}
      />
    </div>
  );
}
