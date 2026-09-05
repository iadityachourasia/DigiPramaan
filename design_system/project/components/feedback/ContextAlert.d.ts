import * as React from 'react';

/**
 * Inline message about the section it sits in — validation summaries, section
 * notices. For a page- or service-wide message use SystemAlert.
 */
export interface ContextAlertProps {
  status?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  compact?: boolean;
}
export declare const ContextAlert: React.FC<ContextAlertProps>;
