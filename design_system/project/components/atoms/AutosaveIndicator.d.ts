import * as React from 'react';

/**
 * Autosave state on a long form. aria-live so the reassurance reaches screen
 * readers too.
 */
export interface AutosaveIndicatorProps {
  state?: 'saving' | 'saved' | 'error';
  /** Relative time, e.g. "2 minutes ago". */
  savedAt?: string;
}
export declare const AutosaveIndicator: React.FC<AutosaveIndicatorProps>;
