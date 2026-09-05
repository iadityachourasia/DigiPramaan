import * as React from 'react';

/**
 * A labelled row of chips acting as one filter control.
 * Single-select renders as a radiogroup, multi-select as a group of toggles.
 */
export interface ChipGroupProps {
  label?: string;
  chips?: Array<string | { label: string; value?: string; count?: number }>;
  selected?: string[];
  multiple?: boolean;
  size?: 'S' | 'M';
  onToggle?: (value: string) => void;
  onClearAll?: () => void;
}
export declare const ChipGroup: React.FC<ChipGroupProps>;
