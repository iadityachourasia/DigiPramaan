import * as React from 'react';

/**
 * Determinate or indeterminate progress for uploads, batch jobs and
 * multi-step completion. Always carries an accessible label.
 */
export interface ProgressIndicatorProps {
  type?: 'linear' | 'circular';
  value?: number;
  max?: number;
  indeterminate?: boolean;
  size?: 'S' | 'M' | 'L';
  label?: string;
  showValue?: boolean;
  status?: 'brand' | 'success' | 'warning' | 'error';
}
export declare const ProgressIndicator: React.FC<ProgressIndicatorProps>;
