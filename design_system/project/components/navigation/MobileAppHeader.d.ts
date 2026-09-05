import * as React from 'react';

/**
 * The mobile app bar. Officers work on phones in the field, so targets here are
 * 44px and the title is a real h1.
 */
export interface MobileAppHeaderProps {
  title?: string;
  subtitle?: string;
  leading?: 'back' | 'menu' | 'close' | 'none';
  onLeading?: () => void;
  actions?: React.ReactNode;
  variant?: 'light' | 'brand';
  /** Draws the mock status bar, for device specimens. */
  statusBar?: boolean;
}
export declare const MobileAppHeader: React.FC<MobileAppHeaderProps>;
