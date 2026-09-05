import * as React from 'react';

/**
 * The general content container: service tiles, dashboard panels, record summaries.
 * Interior spacing comes from Padding tokens, never Stack or Inline.
 */
export interface CardProps {
  title?: string;
  subtitle?: string;
  /** Image or chart node rendered above the header. */
  media?: React.ReactNode;
  /** Material Symbols glyph in the header. */
  icon?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  /** 0-4; keep 0-1 unless the card floats. */
  elevation?: 0 | 1 | 2 | 3 | 4;
  interactive?: boolean;
  padding?: 's' | 'm' | 'l' | 'xl';
  href?: string;
}
export declare const Card: React.FC<CardProps>;
