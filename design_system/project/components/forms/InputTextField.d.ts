import * as React from 'react';

/**
 * The default single-line text input. Every field must carry a real `label`
 * (programmatically associated) — placeholder text is not a label.
 */
export interface InputTextFieldProps {
  label?: string;
  /** Helper text between label and field. */
  hint?: string;
  /** Caption under the field; always shown with a status icon. */
  caption?: string;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  size?: 'M' | 'L';
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  prefix?: string;
  postfix?: string;
  iconLeading?: string;
  iconTrailing?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  optionalText?: string;
  id?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}
export declare const InputTextField: React.FC<InputTextFieldProps>;
