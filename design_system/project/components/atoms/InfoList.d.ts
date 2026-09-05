import * as React from 'react';

/**
 * Read-only key/value summary using a real <dl>. The review-before-submit
 * pattern, and the detail panel on a case.
 */
export interface InfoListProps {
  items?: Array<{ label: string; value: React.ReactNode; hint?: string; action?: React.ReactNode }>;
  /** rows = label above value; columns = two-column grid; inline = label and value on one line. */
  layout?: 'rows' | 'columns' | 'inline';
  size?: 'S' | 'M';
  divided?: boolean;
}
export declare const InfoList: React.FC<InfoListProps>;
