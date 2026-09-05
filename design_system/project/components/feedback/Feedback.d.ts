import * as React from 'react';

/**
 * Satisfaction capture in four shapes the source defines: sentiment faces,
 * stars, NPS 0–10 and a like/dislike pair.
 */
export interface FeedbackProps {
  type?: 'sentiment' | 'stars' | 'nps' | 'like';
  question?: string;
  value?: string | number;
  /** NPS upper bound; 10 in the source. */
  max?: number;
  comment?: boolean;
  submitLabel?: string;
  onSelect?: (value: string | number) => void;
}
export declare const Feedback: React.FC<FeedbackProps>;
