import * as React from 'react';

/**
 * The service footer: link columns, the government access row, and the
 * statutory bottom strip with copyright and "powered by".
 */
export interface FooterProps {
  columns?: Array<{ title: string; links: Array<{ label: string; href?: string }> }>;
  /** Government access row: accessibility statement, RTI, help, etc. */
  accessLinks?: Array<{ label: string; href?: string }>;
  bottomLinks?: Array<{ label: string; href?: string }>;
  copyright?: string;
  poweredBy?: React.ReactNode;
  /** Real marks from assets/logo/ — Digital India, NeGD, and so on. */
  logos?: React.ReactNode;
  newsletter?: boolean;
  variant?: 'light' | 'dark';
}
export declare const Footer: React.FC<FooterProps>;
