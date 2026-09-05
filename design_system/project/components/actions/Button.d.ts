import * as React from 'react';

/**
 * Primary action control. Brand-primary fill is reserved for the single primary
 * action in a view; everything else is Outlined, Tonal or Text.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button label. `children` wins over `label`. */
  label?: string;
  children?: React.ReactNode;
  /** 32 / 40 / 48 / 56px tall. */
  size?: 'S' | 'M' | 'L' | 'XL';
  /** Filled = brand primary action. Outlined = secondary. Tonal = quiet emphasis. Text = lowest. */
  type?: 'filled' | 'outlined' | 'text' | 'tonal';
  shape?: 'rectangle' | 'pill';
  /** Destructive intent — maps to the Action/Destructive token tier. */
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Material Symbols ligature name, e.g. "add". */
  iconLeading?: string;
  iconTrailing?: string;
}
export declare const Button: React.FC<ButtonProps>;
