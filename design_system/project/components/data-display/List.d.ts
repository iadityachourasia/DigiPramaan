import * as React from 'react';

/**
 * Vertical rows of comparable records — activity feeds, audit trails, ranked
 * breakdowns, notification lists.
 */
export interface ListProps {
  items?: Array<{ title: React.ReactNode; supporting?: React.ReactNode; meta?: React.ReactNode; icon?: string; leading?: React.ReactNode; trailing?: React.ReactNode; selected?: boolean; disabled?: boolean }>;
  size?: 'S' | 'M' | 'L';
  divided?: boolean;
  interactive?: boolean;
  ordered?: boolean;
}
export declare const List: React.FC<ListProps>;
