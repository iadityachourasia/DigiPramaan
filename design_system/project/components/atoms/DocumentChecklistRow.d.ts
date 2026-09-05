import * as React from 'react';

/**
 * One required document in a submission checklist, with its state in words.
 * Renders an <li>; wrap the set in a <ul>.
 */
export interface DocumentChecklistRowProps {
  label?: string;
  hint?: string;
  tone?: 'pending' | 'uploaded' | 'accepted' | 'rejected' | 'optional';
  stateLabel?: string;
  size?: 'S' | 'M';
  required?: boolean;
  meta?: string;
  action?: React.ReactNode;
}
export declare const DocumentChecklistRow: React.FC<DocumentChecklistRowProps>;
