import * as React from 'react';

/**
 * One option out of a mutually exclusive set. Group them inside a FormFieldGroup
 * so the set carries a single legend.
 */
export interface RadioButtonProps {
  label?: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  error?: boolean;
  size?: 'S' | 'M' | 'L';
  name?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}
export declare const RadioButton: React.FC<RadioButtonProps>;
