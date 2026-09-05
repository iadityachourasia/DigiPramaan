import type { ReactNode } from "react";

/**
 * PageHeader — consistent page-level heading used by every authenticated page.
 *
 * Renders the h1, an optional description, and an optional action area
 * (e.g. "Scan new product" button on the Records page).
 */

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned actions, e.g. primary CTA button. */
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="lmcs-page-header ux4g-mb-xl">
      <div className="lmcs-page-header-text">
        <h1 className="ux4g-heading-xl-strong">{title}</h1>
        {description ? (
          <p className="ux4g-body-m-default ux4g-text-neutral-secondary lmcs-measure">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="lmcs-page-header-actions">{actions}</div>
      ) : null}
    </header>
  );
}
