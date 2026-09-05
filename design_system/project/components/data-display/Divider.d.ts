import * as React from 'react';

/**
 * A 1px rule separating content. Use sparingly — spacing usually reads better
 * than a line.
 */
export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  dashed?: boolean;
  label?: string;
  spacing?: 'none' | 's' | 'm' | 'l';
}
export declare const Divider: React.FC<DividerProps>;
