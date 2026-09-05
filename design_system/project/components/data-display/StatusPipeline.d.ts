import * as React from 'react';

/**
 * Read-only progress of a case or application through named stages.
 * Stepper is for a form the user walks; this is status the user watches.
 */
export interface StatusPipelineProps {
  stages?: Array<{ label: string; state?: 'complete' | 'current' | 'pending' | 'blocked'; stateLabel?: string; meta?: string }>;
  size?: 'S' | 'M';
  orientation?: 'horizontal' | 'vertical';
}
export declare const StatusPipeline: React.FC<StatusPipelineProps>;
