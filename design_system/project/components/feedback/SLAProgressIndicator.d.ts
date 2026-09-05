import * as React from 'react';

/**
 * Time-bound service commitment on a case or application: how much of the
 * promised window is used, and whether it is breached.
 */
export interface SLAProgressIndicatorProps {
  label?: string;
  elapsed?: number;
  total?: number;
  unit?: string;
  /** Override the derived status. */
  status?: 'success' | 'warning' | 'error';
  /** Custom right-hand text, e.g. "Due 14 Sept". */
  dueLabel?: string;
  breached?: boolean;
  size?: 'S' | 'M';
}
export declare const SLAProgressIndicator: React.FC<SLAProgressIndicatorProps>;
