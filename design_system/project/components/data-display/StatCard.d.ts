import * as React from 'react';

/**
 * Single-metric dashboard tile: label, large value, signed delta with direction.
 * The delta names its direction in text and glyph as well as colour.
 */
export interface StatCardProps {
  label?: string;
  value?: string | number;
  unit?: string;
  /** Formatted delta string, e.g. "+4.2%". */
  delta?: string;
  deltaDirection?: 'up' | 'down' | 'flat';
  deltaLabel?: string;
  icon?: string;
  footnote?: string;
}
export declare const StatCard: React.FC<StatCardProps>;
