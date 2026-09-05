import * as React from 'react';

/**
 * Compact browse tile for a category or region, with an optional record count.
 */
export interface CategoryTileProps {
  label?: string;
  icon?: string;
  count?: number;
  href?: string;
  selected?: boolean;
}
export declare const CategoryTile: React.FC<CategoryTileProps>;
