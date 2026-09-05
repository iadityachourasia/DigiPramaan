import * as React from 'react';

/**
 * Icon-only action. Requires `ariaLabel` — an icon alone is never a label.
 */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Material Symbols ligature name. */
  icon?: string;
  /** Required accessible name. */
  ariaLabel?: string;
  size?: 'S' | 'M' | 'L' | 'XL';
  type?: 'filled' | 'outlined' | 'text' | 'tonal';
  shape?: 'rectangle' | 'pill';
  danger?: boolean;
  disabled?: boolean;
}
export declare const IconButton: React.FC<IconButtonProps>;
