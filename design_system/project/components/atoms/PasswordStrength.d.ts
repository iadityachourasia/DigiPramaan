import * as React from 'react';

/**
 * Password strength meter with the conformity checklist. Strength is a word;
 * each rule announces met/unmet to screen readers.
 */
export interface PasswordStrengthProps {
  strength?: 'weak' | 'medium' | 'strong';
  rules?: Array<{ label: string; met?: boolean }>;
}
export declare const PasswordStrength: React.FC<PasswordStrengthProps>;
