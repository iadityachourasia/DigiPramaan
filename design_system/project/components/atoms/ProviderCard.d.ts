import * as React from 'react';

/**
 * One sign-in or verification method. Always offer a non-biometric route
 * alongside biometric ones.
 */
export interface ProviderCardProps {
  name?: string;
  description?: string;
  icon?: string;
  /** Real provider mark from assets/logo/ where one exists. */
  logo?: React.ReactNode;
  recommended?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** Why this method is unavailable — required when disabled. */
  unavailableNote?: string;
  onSelect?: () => void;
}
export declare const ProviderCard: React.FC<ProviderCardProps>;
