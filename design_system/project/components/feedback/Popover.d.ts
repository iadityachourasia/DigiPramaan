import * as React from 'react';

/**
 * Anchored panel holding rich content or controls — richer than a Tooltip,
 * lighter than a Modal, and it does not block the page.
 */
export interface PopoverProps {
  open?: boolean;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
}
export declare const Popover: React.FC<PopoverProps>;
