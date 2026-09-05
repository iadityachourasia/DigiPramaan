import * as React from 'react';

/**
 * The shared focus indicator, for elements that cannot draw their own.
 * The global :focus-visible rule in tokens/foundation.css covers standard controls.
 */
export interface FocusRingProps {
  children?: React.ReactNode;
  /** Force the ring on, for specimens. Normally driven by :focus-visible within. */
  visible?: boolean;
  width?: 1 | 2;
  radius?: 'rounded' | 'sharp' | 'circular';
  inverse?: boolean;
  offset?: number;
}
export declare const FocusRing: React.FC<FocusRingProps>;
