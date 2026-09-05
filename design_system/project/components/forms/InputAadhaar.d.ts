import * as React from 'react';

/**
 * Aadhaar number entry — 12 digits, 4-4-4 grouping, maskable.
 * Never display a full unmasked Aadhaar number after capture.
 */
export interface InputAadhaarProps {
  label?: string;
  value?: string;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  caption?: string;
  /** Masks the first 8 digits (XXXX XXXX 1234) once captured. */
  masked?: boolean;
  verified?: boolean;
  required?: boolean;
  disabled?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}
export declare const InputAadhaar: React.FC<InputAadhaarProps>;
