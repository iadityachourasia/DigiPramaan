import * as React from 'react';

/**
 * One row of a search-results list. The title is the link; the path tells the
 * user where the result lives.
 */
export interface ResultListRowProps {
  title?: string;
  href?: string;
  snippet?: string;
  /** Breadcrumb path shown above the snippet. */
  path?: string[];
  meta?: React.ReactNode[];
  type?: { label: string; icon?: string };
  thumbnail?: React.ReactNode;
  tags?: React.ReactNode;
}
export declare const ResultListRow: React.FC<ResultListRowProps>;
