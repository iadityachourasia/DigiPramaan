import * as React from 'react';

/**
 * One short line naming or clarifying its trigger. Never the only place
 * information appears — tooltips are unavailable on touch.
 */
export interface TooltipProps {
  label?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  children?: React.ReactNode;
  /** Force-open, for specimens and tests. */
  visible?: boolean;
}
export declare const Tooltip: React.FC<TooltipProps>;
