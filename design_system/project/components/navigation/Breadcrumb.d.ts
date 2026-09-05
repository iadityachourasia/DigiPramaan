import * as React from 'react';

/**
 * Shows where the current page sits in the hierarchy and gives one-click
 * escape upwards. The last item is the current page and is not a link.
 */
export interface BreadcrumbProps {
  items?: Array<{ label: string; href?: string; icon?: string }>;
  /** The file's default divider is a forward slash; chevron is also defined. */
  divider?: 'chevron' | 'slash';
  /** Collapse the middle of a long trail behind an ellipsis. */
  maxVisible?: number;
}
export declare const Breadcrumb: React.FC<BreadcrumbProps>;
