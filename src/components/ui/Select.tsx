import type { SelectHTMLAttributes } from "react";

/**
 * Select — a thin wrapper over the UX4G select composition.
 *
 * The real package ships a custom listbox (confirmed via the compiled
 * stylesheet: `.ux4g-select-control`/`-value`/`-caret`/`-menu`/`-list`/`-option`,
 * plus a visually-hidden `.ux4g-select-native` shadow `<select>` for native
 * form semantics). Building that popup's full keyboard/ARIA behaviour from
 * scratch is a meaningfully larger undertaking than this form needs for two
 * short, fixed option lists (product category, region).
 *
 * This wrapper takes the pragmatic, honest middle path instead: the REAL
 * classes (`ux4g-select`, `ux4g-select-control`, `ux4g-select-caret`), but
 * wrapping a real, visible native `<select>` rather than reconstructing the
 * package's custom popup — native keyboard/screen-reader behaviour for free,
 * at the cost of the package's own richer popup affordances (search,
 * multi-select chips), which this form does not need. Flagged here rather
 * than silently presented as the full component.
 */

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "size"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  size?: "sm" | "md" | "lg";
}

export function Select({
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  size = "md",
  ...selectProps
}: SelectProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="ux4g-input-container">
      <label className="ux4g-label-m-default" htmlFor={id}>
        {label}
      </label>

      <div className={`ux4g-select ux4g-select-${size}${error ? " is-error" : ""}`}>
        <div className="ux4g-select-control">
          <select
            {...selectProps}
            id={id}
            className="lmcs-select-native"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          >
            {placeholder ? (
              <option value="" disabled>
                {placeholder}
              </option>
            ) : null}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="ux4g-icon-outlined ux4g-select-caret" aria-hidden="true">
            expand_more
          </span>
        </div>
      </div>

      {error ? (
        <div className="ux4g-input-helper" id={errorId} role="alert">
          <span className="ux4g-icon-outlined ux4g-input-helper-icon" aria-hidden="true">
            error
          </span>
          <span className="ux4g-input-helper-text">{error}</span>
        </div>
      ) : hint ? (
        <div className="ux4g-input-helper" id={hintId}>
          <span className="ux4g-input-helper-text">{hint}</span>
        </div>
      ) : null}
    </div>
  );
}
