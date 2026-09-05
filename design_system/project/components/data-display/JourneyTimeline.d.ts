import * as React from 'react';

/**
 * Chronological audit trail on a record: who did what, when.
 * Every entry names an actor and a timestamp — this is evidence.
 */
export interface JourneyTimelineProps {
  events?: Array<{ title: string; time: string; actor?: string; role?: string; detail?: string; icon?: string; status?: 'neutral' | 'success' | 'warning' | 'error'; attachments?: React.ReactNode }>;
  size?: 'S' | 'M';
}
export declare const JourneyTimeline: React.FC<JourneyTimelineProps>;
