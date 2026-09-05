import type { ReactNode } from "react";

/**
 * EmptyState — shown when a list, table, or search has zero results.
 *
 * COMPONENT_SPEC.md §4 calls this an "Empty State" composition. UX4G does
 * not ship one as a component, so this is application-specific markup using
 * only UX4G tokens and text classes. Every empty state in the product goes
 * through here so the pattern is consistent.
 */

export interface EmptyStateProps {
  /** Material icon ligature, e.g. "search_off" or "inbox". */
  icon: string;
  title: string;
  description?: string;
  /** Optional action, e.g. a "Clear filters" button. */
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="lmcs-empty-state" role="status">
      <span
        className="ux4g-icon-outlined lmcs-empty-state-icon"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="ux4g-title-m-strong">{title}</p>
      {description ? (
        <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
          {description}
        </p>
      ) : null}
      {action ? <div className="ux4g-mt-m">{action}</div> : null}
    </div>
  );
}
