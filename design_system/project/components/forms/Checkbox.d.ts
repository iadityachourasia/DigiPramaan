import * as React from 'react';

/**
 * Single boolean choice, or one row of a multi-select group.
 * Always pass `label` — the box alone has no accessible name.
 */
export interface CheckboxProps {
  label?: string;
  description?: string;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  error?: boolean;
  size?: 'S' | 'M' | 'L';
  name?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}
export declare const Checkbox: React.FC<CheckboxProps>;
