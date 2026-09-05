import * as React from 'react';

/**
 * The identifier a citizen or officer quotes on the phone. Monospaced, copyable,
 * and never truncated.
 */
export interface ReferenceIdProps {
  value?: string;
  label?: string;
  /** Post-copy confirmation state. */
  copied?: boolean;
  onCopy?: () => void;
  size?: 'S' | 'M';
}
export declare const ReferenceId: React.FC<ReferenceIdProps>;
