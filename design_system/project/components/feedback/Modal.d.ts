import * as React from 'react';

/**
 * Blocking dialog for a decision that must be answered before continuing —
 * confirmations, destructive actions, consent.
 */
export interface ModalProps {
  open?: boolean;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  size?: 'S' | 'M' | 'L';
  status?: 'info' | 'success' | 'warning' | 'error';
  onClose?: () => void;
  closeLabel?: string;
}
export declare const Modal: React.FC<ModalProps>;
