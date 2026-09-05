import * as React from 'react';

/**
 * The statutory accessibility strip above the masthead: skip link, text
 * resizing, contrast mode and language switch.
 */
export interface AccessibilityBarProps {
  textScale?: number;
  contrast?: 'normal' | 'high';
  language?: string;
  languages?: Array<{ code: string; label: string }>;
  skipHref?: string;
  onTextScale?: (scale: number) => void;
  onContrast?: (mode: 'normal' | 'high') => void;
  onLanguage?: (code: string) => void;
}
export declare const AccessibilityBar: React.FC<AccessibilityBarProps>;
