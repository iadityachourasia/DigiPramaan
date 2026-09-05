import * as React from 'react';

/**
 * Manually advanced slide strip for scan galleries and evidence photos.
 * No autoplay: motion the user did not ask for fails WCAG 2.2.2.
 */
export interface CarouselProps {
  slides?: Array<{ media?: React.ReactNode; title?: string; caption?: string }>;
  index?: number;
  dark?: boolean;
  showCaption?: boolean;
  onIndexChange?: (index: number) => void;
}
export declare const Carousel: React.FC<CarouselProps>;
