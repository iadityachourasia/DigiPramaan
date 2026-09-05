import * as React from 'react';

/**
 * The scrim layer. Modal and Drawer already render one; use Backdrop directly
 * only for custom overlays or a blocking load.
 */
export interface BackdropProps {
  open?: boolean;
  strength?: 'default' | 'strong';
  blur?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
}
export declare const Backdrop: React.FC<BackdropProps>;
