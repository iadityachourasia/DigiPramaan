import * as React from 'react';

/**
 * Attribution strip for a footer or embedded widget. Renders the name in type
 * when no mark is supplied, rather than inventing one.
 */
export interface PoweredByProps {
  text?: string;
  name?: string;
  /** Real mark from assets/logo/ — preferred over the type fallback. */
  logo?: React.ReactNode;
  href?: string;
  layout?: 'inline' | 'stacked';
}
export declare const PoweredBy: React.FC<PoweredByProps>;
