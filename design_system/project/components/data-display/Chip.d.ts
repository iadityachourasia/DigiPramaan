import * as React from 'react';

/**
 * Interactive filter or selection token. Renders a real button with
 * aria-pressed — screen readers hear the selected state.
 */
export interface ChipProps {
  children?: React.ReactNode;
  label?: string;
  selected?: boolean;
  disabled?: boolean;
  size?: 'S' | 'M';
  icon?: string;
  avatar?: React.ReactNode;
  count?: number;
  onRemove?: () => void;
  onClick?: () => void;
}
export declare const Chip: React.FC<ChipProps>;
