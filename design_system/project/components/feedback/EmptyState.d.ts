import * as React from 'react';

/**
 * Fills a region that has nothing to show, and says what to do next.
 * An empty region without an EmptyState reads as a broken page.
 */
export interface EmptyStateProps {
  variant?: 'default' | 'search' | 'error';
  /** Material Symbols glyph standing in for the source's empty-state artwork. */
  icon?: string;
  title?: string;
  description?: string;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  size?: 'S' | 'M' | 'L';
}
export declare const EmptyState: React.FC<EmptyStateProps>;
