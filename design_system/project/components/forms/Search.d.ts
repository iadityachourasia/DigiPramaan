import * as React from 'react';

/**
 * Keyword search over a collection, with an optional suggestions panel.
 */
export interface SearchProps {
  label?: string;
  placeholder?: string;
  value?: string;
  size?: 'S' | 'M' | 'L' | 'XL';
  withButton?: boolean;
  buttonLabel?: string;
  /** Suggestion panel rows; omit for a plain search box. */
  suggestions?: string[];
  disabled?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onSubmit?: () => void;
}
export declare const Search: React.FC<SearchProps>;
