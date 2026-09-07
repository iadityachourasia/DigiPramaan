"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { REPORT_FORMATS, type ReportFormat } from "@/types";

/**
 * FormatSelect — output format selection (10 §2).
 *
 * A real `<fieldset>` of checkboxes, which is the whole point: 10 §5 says
 * format selection must be "a clear multi-select or distinct toggle, not
 * implied by a filename extension after the fact", and the Definition of
 * Done requires both PDF and an editable format be *genuinely* selectable.
 * A checkbox group makes generating both the obvious default rather than an
 * edge case, and matches `GeneratedReport.formats` being an array.
 *
 * The PS requires "PDF *and* editable formats" — note the "and" (BRD
 * FR-FILE-04). Selecting neither is blocked at generate time with an
 * explanation, not by pre-disabling the button.
 */

export interface FormatSelectProps {
  selected: readonly ReportFormat[];
  onToggle: (format: ReportFormat) => void;
  labels: {
    legend: string;
    hint: string;
    formatLabel: (format: ReportFormat) => string;
    formatHint: (format: ReportFormat) => string;
  };
}

export function FormatSelect({ selected, onToggle, labels }: FormatSelectProps) {
  return (
    <fieldset className="lmcs-format-select">
      <legend className="ux4g-label-l-default">{labels.legend}</legend>
      <p className="ux4g-body-s-default ux4g-text-neutral-secondary">{labels.hint}</p>

      <div className="lmcs-format-options">
        {REPORT_FORMATS.map((format) => (
          <div key={format} className="lmcs-format-option">
            <Checkbox
              id={`report-format-${format}`}
              label={labels.formatLabel(format)}
              checked={selected.includes(format)}
              onChange={() => onToggle(format)}
            />
            <p className="ux4g-body-s-default ux4g-text-neutral-secondary">
              {labels.formatHint(format)}
            </p>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
