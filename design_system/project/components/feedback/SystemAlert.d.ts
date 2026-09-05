import * as React from 'react';

/**
 * Service-wide announcement: scheduled downtime, policy change, outage.
 * One at a time, pinned above the header.
 */
export interface SystemAlertProps {
  status?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message?: string;
  linkLabel?: string;
  linkHref?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}
export declare const SystemAlert: React.FC<SystemAlertProps>;
