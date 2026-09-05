/**
 * LoadingSpinner — the app-wide loading indicator.
 *
 * Uses the UX4G spinner composition. The `aria-label` ensures screen readers
 * announce what is loading, not just that something is spinning (A-10).
 */

export interface LoadingSpinnerProps {
  /** Accessible label, e.g. "Loading compliance records". */
  label: string;
  /** Render inline (within a section) or full-page (centred). */
  variant?: "inline" | "page";
}

export function LoadingSpinner({
  label,
  variant = "inline",
}: LoadingSpinnerProps) {
  return (
    <div
      className={`lmcs-loading-spinner lmcs-loading-spinner-${variant}`}
      role="status"
      aria-label={label}
    >
      <span className="ux4g-spinner ux4g-spinner-md" aria-hidden="true" />
      <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
        {label}
      </span>
    </div>
  );
}
