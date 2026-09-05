import * as React from 'react';

/**
 * Attempts remaining on a verification step. Escalates its own tone on the last
 * attempt; states the lockout consequence rather than implying it.
 */
export interface AttemptCounterProps {
  remaining?: number;
  total?: number;
  /** What happens on lockout, shown on the last attempt and after. */
  lockoutNote?: string;
}
export declare const AttemptCounter: React.FC<AttemptCounterProps>;
