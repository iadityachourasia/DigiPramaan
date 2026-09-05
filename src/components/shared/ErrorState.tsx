import type { ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";

/**
 * ErrorState — shown when an API call or page-level operation fails.
 *
 * Wraps the Alert component so every error in the product looks the same
 * and carries both a title and a recovery action.
 */

export interface ErrorStateProps {
  title: string;
  description: string;
  /** e.g. a "Try again" button. */
  action?: ReactNode;
}

export function ErrorState({ title, description, action }: ErrorStateProps) {
  return (
    <div className="lmcs-error-state">
      <Alert severity="error" title={title} live="assertive" actions={action}>
        {description}
      </Alert>
    </div>
  );
}
