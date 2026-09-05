import * as React from 'react';

/**
 * Multi-step form progress the user walks through. State is derived from
 * activeIndex unless a step declares its own (e.g. error).
 */
export interface StepperProps {
  steps?: Array<{ label: string; supporting?: string; state?: 'complete' | 'current' | 'upcoming' | 'error' }>;
  activeIndex?: number;
  orientation?: 'horizontal' | 'vertical';
  size?: 'S' | 'M';
  labelLayout?: 'below' | 'beside';
  onStepClick?: (index: number) => void;
}
export declare const Stepper: React.FC<StepperProps>;
