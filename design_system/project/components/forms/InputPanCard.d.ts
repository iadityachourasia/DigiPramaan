import * as React from 'react';

/**
 * PAN entry — ten characters, AAAAA9999A, always upper case and monospaced.
 */
export interface InputPanCardProps {
  label?: string;
  value?: string;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  caption?: string;
  verified?: boolean;
  required?: boolean;
  disabled?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}
export declare const InputPanCard: React.FC<InputPanCardProps>;
