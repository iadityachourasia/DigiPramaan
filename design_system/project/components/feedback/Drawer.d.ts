import * as React from 'react';

/**
 * Side sheet for secondary work that keeps page context: filters, record detail,
 * an audit trail. Use instead of a modal when the user may want to compare.
 */
export interface DrawerProps {
  open?: boolean;
  side?: 'left' | 'right' | 'bottom';
  size?: 'S' | 'M' | 'L';
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
}
export declare const Drawer: React.FC<DrawerProps>;
