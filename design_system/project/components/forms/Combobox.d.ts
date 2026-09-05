import * as React from 'react';

/**
 * Type-to-filter selection from a long list; supports single and multi select.
 * Under ~7 fixed options, prefer RadioButton or DropdownMenu.
 */
export interface ComboboxProps {
  label?: string;
  hint?: string;
  caption?: string;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  options?: Array<string | { label: string; value?: string }>;
  value?: string | string[];
  placeholder?: string;
  multiple?: boolean;
  open?: boolean;
  disabled?: boolean;
  onSelect?: (value: string) => void;
}
export declare const Combobox: React.FC<ComboboxProps>;
