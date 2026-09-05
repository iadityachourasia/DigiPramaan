import * as React from 'react';

/**
 * Entry tile for a service. The whole card is one link, so it is a single
 * keyboard target with a visible focus ring.
 */
export interface ServiceCardProps {
  title?: string;
  description?: string;
  icon?: string;
  href?: string;
  meta?: string;
  /** A Tag node, e.g. "New" or "Beta". */
  tag?: React.ReactNode;
  disabled?: boolean;
}
export declare const ServiceCard: React.FC<ServiceCardProps>;
