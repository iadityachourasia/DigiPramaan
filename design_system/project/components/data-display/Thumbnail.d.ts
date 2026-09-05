import * as React from 'react';

/**
 * Fixed-ratio image preview for table cells and list rows, with a file-type
 * glyph fallback when no image exists.
 */
export interface ThumbnailProps {
  src?: string;
  alt?: string;
  size?: 'S' | 'M' | 'L';
  /** CSS aspect-ratio string, e.g. "1" or "4/3". */
  ratio?: string;
  icon?: string;
  badge?: React.ReactNode;
}
export declare const Thumbnail: React.FC<ThumbnailProps>;
