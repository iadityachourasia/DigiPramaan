"use client";

import { useState } from "react";

import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { DECLARATION_FIELDS, type DeclarationFieldId } from "@/types";

/**
 * ManualEntryForm — the full alternative to the photo-capture flow
 * (03-scan-upload.md §2 Step 4, §3 step 4: "or uses manual entry instead of
 * the capture flow entirely"). Every mandatory declaration, transcribed
 * directly, for a damaged label or an officer who already has the values
 * written down. Country of Origin only appears once the product is marked an
 * import — DECLARATION_FIELDS.importsOnly is the same rule the checklist and
 * mock records already use, not a re-invented condition.
 *
 * Reports its values live via `onValuesChange` rather than owning its own
 * <form>/submit — the wizard has exactly one Submit action shared with the
 * metadata form and the capture-slot path, so this stays a plain fieldset
 * whose state the page composes together at submit time. Plain controlled
 * state rather than react-hook-form: there is no validation rule here beyond
 * "some values were entered", so react-hook-form would add a dependency
 * (`watch`, which the project's React Compiler cannot safely memoize) for no
 * benefit this component actually uses.
 */

export type ManualEntryValues = Partial<Record<DeclarationFieldId, string>> & {
  isImport: boolean;
};

export interface ManualEntryFormProps {
  onValuesChange: (values: ManualEntryValues) => void;
  labels: {
    heading: string;
    body: string;
    isImportLabel: string;
    valueHint: string;
    fieldLabel: (fieldId: DeclarationFieldId) => string;
  };
}

export function ManualEntryForm({ onValuesChange, labels }: ManualEntryFormProps) {
  const [values, setValues] = useState<ManualEntryValues>({ isImport: false });

  function update(patch: Partial<ManualEntryValues>) {
    const next = { ...values, ...patch };
    setValues(next);
    onValuesChange(next);
  }

  const visibleFields = DECLARATION_FIELDS.filter(
    (field) => !field.importsOnly || values.isImport
  );

  return (
    <div className="lmcs-form-grid">
      <div>
        <h2 className="ux4g-title-m-strong">{labels.heading}</h2>
        <p className="ux4g-body-s-default ux4g-text-neutral-secondary">{labels.body}</p>
      </div>

      <Checkbox
        id="manual-entry-is-import"
        label={labels.isImportLabel}
        checked={values.isImport}
        onChange={(event) => update({ isImport: event.target.checked })}
      />

      {visibleFields.map((field) => (
        <TextField
          key={field.id}
          id={`manual-entry-${field.id}`}
          label={labels.fieldLabel(field.id)}
          hint={labels.valueHint}
          value={values[field.id] ?? ""}
          onChange={(event) => update({ [field.id]: event.target.value })}
        />
      ))}
    </div>
  );
}
