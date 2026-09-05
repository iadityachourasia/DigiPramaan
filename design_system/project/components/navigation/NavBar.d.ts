import * as React from 'react';

/**
 * The service masthead and primary navigation. One per page, at the top.
 * variant="brand" is an identity moment, not a decorative fill.
 */
export interface NavBarProps {
  brand?: string;
  brandHref?: string;
  /** Pass the real UX4G mark from assets/logo/ when available. */
  logo?: React.ReactNode;
  items?: Array<{ label: string; href?: string; icon?: string; dropdown?: boolean }>;
  activeIndex?: number;
  actions?: React.ReactNode;
  layout?: 'right' | 'left';
  variant?: 'light' | 'brand';
}
export declare const NavBar: React.FC<NavBarProps>;
