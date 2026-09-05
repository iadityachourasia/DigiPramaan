import * as React from 'react';

/**
 * Sticky strip on a multi-step application showing draft state, reference ID and
 * autosave. Keeps the user oriented across sessions.
 */
export interface DraftStatusBannerProps {
  status?: 'draft' | 'submitted' | 'returned' | 'expiring' | 'locked';
  title?: string;
  referenceId?: string;
  savedAt?: string;
  autosaving?: boolean;
  actions?: React.ReactNode;
}
export declare const DraftStatusBanner: React.FC<DraftStatusBannerProps>;
