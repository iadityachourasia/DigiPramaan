import * as React from 'react';

/**
 * Immediate on/off setting — the change applies the moment it is flipped.
 * If the change needs a Save press, use a Checkbox instead.
 */
export interface ToggleProps {
  label?: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  size?: 'S' | 'M' | 'L';
  labelPosition?: 'start' | 'end';
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}
export declare const Toggle: React.FC<ToggleProps>;
