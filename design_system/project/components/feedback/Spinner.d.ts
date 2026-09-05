import * as React from 'react';

/**
 * Small indeterminate activity indicator for inline and in-button loading.
 * For anything measurable use ProgressIndicator.
 */
export interface SpinnerProps {
  size?: 'XS' | 'S' | 'M' | 'L';
  tone?: 'brand' | 'destructive' | 'light';
  label?: string;
  showLabel?: boolean;
}
export declare const Spinner: React.FC<SpinnerProps>;
