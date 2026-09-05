import * as React from 'react';

/**
 * Fingerprint, iris or face capture for Aadhaar-backed identity checks, with
 * device-readiness checks and an attempt counter.
 */
export interface BiometricCaptureProps {
  mode?: 'fingerprint' | 'iris' | 'face';
  state?: 'idle' | 'scanning' | 'captured' | 'retry' | 'error';
  attempt?: number;
  maxAttempts?: number;
  deviceChecks?: Array<{ label: string; status?: 'ok' | 'fail' | 'pending' }>;
  instruction?: string;
  /** Live camera or device preview node. */
  preview?: React.ReactNode;
  captureLabel?: string;
  onCapture?: () => void;
}
export declare const BiometricCapture: React.FC<BiometricCaptureProps>;
