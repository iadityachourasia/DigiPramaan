import * as React from 'react';

/**
 * One row of the notification panel. Renders an <li>, so wrap a group in a <ul>.
 * Unread state carries screen-reader text, not just a dot.
 */
export interface NotificationItemProps {
  title?: string;
  message?: string;
  time?: string;
  icon?: string;
  avatar?: React.ReactNode;
  unread?: boolean;
  status?: 'info' | 'success' | 'warning' | 'error';
  /** Inline action — the source's Action=true variant. */
  action?: React.ReactNode;
  onDismiss?: () => void;
}
export declare const NotificationItem: React.FC<NotificationItemProps>;
