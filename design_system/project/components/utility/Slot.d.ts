import * as React from 'react';

/**
 * Marks where a component accepts consumer content. Shows a labelled dashed
 * box when empty, so an unfilled slot is visible rather than silently missing.
 */
export interface SlotProps {
  children?: React.ReactNode;
  label?: string;
  minHeight?: number;
  /** Force the placeholder even when children exist (specimens). */
  showPlaceholder?: boolean;
  dashed?: boolean;
}
export declare const Slot: React.FC<SlotProps>;
