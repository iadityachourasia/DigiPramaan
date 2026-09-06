"use client";

import {
  DECLARATION_FIELDS,
  type ComplianceRecord,
  type DeclarationFieldId,
  type ExtractedDeclaration,
} from "@/types";

import { FieldRow } from "./FieldRow";

/**
 * ExtractionPanel — the right panel of the two-panel layout
 * (04-extraction-verification.md §2/§3): the overall-confidence summary
 * required at the top of this panel, then one FieldRow per applicable
 * declaration. Country of Origin only appears when the record's checklist
 * actually carries it — the same `DECLARATION_FIELDS.importsOnly` rule
 * `ManualEntryForm.tsx` already uses, not a re-invented condition.
 */

export interface ExtractionPanelProps {
  record: ComplianceRecord;
  readOnly: boolean;
  onCorrect: (fieldId: DeclarationFieldId, value: string) => void;
  onViewImage: (angle: ExtractedDeclaration["sourceImageAngle"]) => void;
  labels: {
    overallConfidence: (percentage: number) => string;
    fieldLabel: (fieldId: DeclarationFieldId) => string;
    notDetected: string;
    corrected: string;
    confidenceLabel: (band: ExtractedDeclaration["band"]) => string;
    sourceAngleLabel: (angle: ExtractedDeclaration["sourceImageAngle"]) => string;
    sourceEngineLabel: (engine: ExtractedDeclaration["sourceEngine"]) => string;
    viewImage: string;
  };
}

export function ExtractionPanel({
  record,
  readOnly,
  onCorrect,
  onViewImage,
  labels,
}: ExtractionPanelProps) {
  const applicableFieldIds = new Set(record.checklist.map((line) => line.fieldId));
  const fields = DECLARATION_FIELDS.filter((field) => applicableFieldIds.has(field.id));

  return (
    <div className="lmcs-extraction-panel">
      <p className="ux4g-body-m-default lmcs-extraction-overall-confidence">
        {labels.overallConfidence(record.extraction.overallConfidence)}
      </p>

      <div className="lmcs-extraction-field-list">
        {fields.map((field) => {
          const declaration = record.extraction.declarations.find((d) => d.fieldId === field.id);
          if (!declaration) return null;
          return (
            <FieldRow
              key={field.id}
              fieldId={field.id}
              declaration={declaration}
              readOnly={readOnly}
              onCorrect={onCorrect}
              onViewImage={() => onViewImage(declaration.sourceImageAngle)}
              labels={{
                fieldLabel: labels.fieldLabel(field.id),
                legalBasis: field.legalBasis,
                notDetected: labels.notDetected,
                corrected: labels.corrected,
                confidenceLabel: labels.confidenceLabel(declaration.band),
                sourceAngleLabel: labels.sourceAngleLabel,
                sourceEngineLabel: labels.sourceEngineLabel,
                viewImage: labels.viewImage,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
