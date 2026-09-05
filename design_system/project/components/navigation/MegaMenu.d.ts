import * as React from 'react';

/**
 * Full-width grouped-link panel for services with many destinations.
 * Group titles are mandatory — an ungrouped wall of links is unusable.
 */
export interface MegaMenuProps {
  open?: boolean;
  columns?: Array<{ title: string; links: Array<{ label: string; href?: string; icon?: string; description?: string }> }>;
  featured?: React.ReactNode;
  footerLinks?: React.ReactNode;
  onClose?: () => void;
}
export declare const MegaMenu: React.FC<MegaMenuProps>;
