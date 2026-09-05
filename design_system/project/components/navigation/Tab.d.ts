import * as React from 'react';

/**
 * Switches between sibling views of the same record without leaving the page.
 * Proper tablist/tab/tabpanel wiring.
 */
export interface TabProps {
  items?: Array<{ label: string; icon?: string; count?: number; disabled?: boolean; content?: React.ReactNode }>;
  activeIndex?: number;
  type?: 'underline' | 'contained' | 'pill';
  size?: 'S' | 'M' | 'L';
  fullWidth?: boolean;
  onChange?: (index: number) => void;
}
export declare const Tab: React.FC<TabProps>;
