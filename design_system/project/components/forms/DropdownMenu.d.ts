import * as React from 'react';

/**
 * A menu of actions hung off a trigger — row overflow menus, bulk actions.
 * For choosing a value that stays in a field, use Combobox.
 */
export interface DropdownMenuProps {
  triggerLabel?: string;
  items?: Array<{ label?: string; value?: string; icon?: string; trailingIcon?: string; shortcut?: string; danger?: boolean; disabled?: boolean; divider?: boolean }>;
  size?: 'S' | 'M';
  open?: boolean;
  align?: 'start' | 'end';
  onAction?: (value: string) => void;
}
export declare const DropdownMenu: React.FC<DropdownMenuProps>;
