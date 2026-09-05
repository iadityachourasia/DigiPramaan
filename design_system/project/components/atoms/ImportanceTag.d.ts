import * as React from 'react';

/**
 * Priority marker on a notice, case or notification. Two levels only — a
 * third tier makes every item "important".
 */
export interface ImportanceTagProps {
  importance?: 'high' | 'normal';
  label?: string;
}
export declare const ImportanceTag: React.FC<ImportanceTagProps>;
