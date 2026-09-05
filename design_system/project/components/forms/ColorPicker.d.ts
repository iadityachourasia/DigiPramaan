import * as React from 'react';

/**
 * A curated swatch grid, not a free colour picker. Options must come from the
 * token palette so authored content cannot leave the system.
 */
export interface ColorPickerProps {
  label?: string;
  /** Curated swatches — CSS colour strings or { name, value }. */
  swatches?: Array<string | { name: string; value: string }>;
  value?: string;
  disabled?: boolean;
  onSelect?: (value: string) => void;
}
export declare const ColorPicker: React.FC<ColorPickerProps>;
