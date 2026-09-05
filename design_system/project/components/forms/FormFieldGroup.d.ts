import * as React from 'react';

/**
 * Groups related fields under one legend — the accessible container for radio
 * and checkbox sets, and for multi-part fields like address or date of birth.
 */
export interface FormFieldGroupProps {
  legend?: string;
  description?: string;
  caption?: string;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  required?: boolean;
  /** stack = one control per row; inline = controls side by side; grid = two columns. */
  layout?: 'stack' | 'inline' | 'grid';
  children?: React.ReactNode;
}
export declare const FormFieldGroup: React.FC<FormFieldGroupProps>;
