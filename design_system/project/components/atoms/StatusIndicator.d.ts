import * as React from 'react';

/**
 * Inline status marker with its word. Use in table cells, list rows and detail
 * panels. Replaces the reference dashboard's colour-only status dot.
 */
export interface StatusIndicatorProps {
  state?: 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'disabled';
  /** Overrides the default word for the state. */
  label?: string;
  size?: 'S' | 'M';
  icon?: string;
}
export declare const StatusIndicator: React.FC<StatusIndicatorProps>;
