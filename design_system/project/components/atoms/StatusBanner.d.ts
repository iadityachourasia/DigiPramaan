import * as React from 'react';

/**
 * Wide state banner at the head of an application or case: stage, since when,
 * and what happens next. One per record.
 */
export interface StatusBannerProps {
  status?: 'draft' | 'submitted' | 'inreview' | 'approved' | 'rejected' | 'returned' | 'expired' | 'onhold';
  title?: string;
  detail?: string;
  since?: string;
  /** What the user or officer should expect next. */
  nextStep?: string;
  referenceId?: string;
  actions?: React.ReactNode;
}
export declare const StatusBanner: React.FC<StatusBannerProps>;
