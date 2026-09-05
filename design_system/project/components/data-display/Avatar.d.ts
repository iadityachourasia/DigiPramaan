import * as React from 'react';

/**
 * Person or entity marker: photo, initials, or icon fallback in that order.
 * Use real photography where it exists; never draw a face.
 */
export interface AvatarProps {
  name?: string;
  src?: string;
  icon?: string;
  size?: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
  shape?: 'circle' | 'square';
  status?: 'online' | 'offline' | 'busy' | 'away';
  statusLabel?: string;
}
export declare const Avatar: React.FC<AvatarProps>;
