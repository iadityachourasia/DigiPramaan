import * as React from 'react';

/**
 * Inline navigation within prose or a list. Underlined by default so it is
 * distinguishable without colour (WCAG 1.4.1).
 */
export interface LinkProps {
  children?: React.ReactNode;
  href?: string;
  size?: 'S' | 'M' | 'L';
  external?: boolean;
  icon?: string;
  iconPosition?: 'start' | 'end';
  /** For use on dark or brand-filled surfaces. */
  inverse?: boolean;
  disabled?: boolean;
}
export declare const Link: React.FC<LinkProps>;
