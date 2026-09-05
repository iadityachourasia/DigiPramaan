import * as React from 'react';

/**
 * Ratio-locked figure with caption, credit and loading/error fallbacks.
 */
export interface ImageProps {
  src?: string;
  alt?: string;
  ratio?: string;
  fit?: 'cover' | 'contain';
  caption?: string;
  credit?: string;
  rounded?: boolean;
  state?: 'loaded' | 'loading' | 'error';
}
export declare const Image: React.FC<ImageProps>;
