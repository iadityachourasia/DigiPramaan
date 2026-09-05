import * as React from 'react';

/**
 * Progressive disclosure for long reference content — guidance notes, FAQs,
 * per-section detail on a long record.
 */
export interface AccordionProps {
  items?: Array<{ title: React.ReactNode; supporting?: React.ReactNode; meta?: React.ReactNode; icon?: string; content?: React.ReactNode; open?: boolean }>;
  /** Allow several panels open at once. */
  multiple?: boolean;
  size?: 'S' | 'M' | 'L';
  divided?: boolean;
}
export declare const Accordion: React.FC<AccordionProps>;
