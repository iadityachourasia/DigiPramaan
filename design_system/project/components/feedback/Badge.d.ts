import * as React from 'react';

/**
 * A count or dot marker on top of another element (bell icon, avatar, tab).
 * Not a status label — that is Tag.
 */
export interface BadgeProps {
  count?: number;
  max?: number;
  type?: 'count' | 'dot';
  color?: 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info';
  showZero?: boolean;
  withBorder?: boolean;
  /** Screen-reader text; a bare dot needs one. */
  srLabel?: string;
  children?: React.ReactNode;
}
export declare const Badge: React.FC<BadgeProps>;
