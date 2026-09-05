import * as React from 'react';

/**
 * One-time password entry for Aadhaar / mobile verification, with the source's
 * attempt counter and resend countdown.
 */
export interface InputOTPProps {
  label?: string;
  length?: number;
  value?: string;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  caption?: string;
  size?: 'M' | 'L';
  masked?: boolean;
  /** Renders the source's attempt counter. */
  attemptsLeft?: number;
  /** Countdown seconds until resend is allowed. */
  resendIn?: number;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}
export declare const InputOTP: React.FC<InputOTPProps>;
