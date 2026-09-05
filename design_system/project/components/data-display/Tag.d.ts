import * as React from 'react';

/**
 * Status and category label. This is the component that carries status in tables
 * and lists — always with an icon, so meaning never rests on colour.
 */
export interface TagProps {
  children?: React.ReactNode;
  label?: string;
  size?: 'S' | 'M';
  color?: 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info';
  type?: 'tonal' | 'filled' | 'outline' | 'text';
  shape?: 'rectangular' | 'circular';
  icon?: string;
  onRemove?: () => void;
  removeLabel?: string;
}
export declare const Tag: React.FC<TagProps>;
