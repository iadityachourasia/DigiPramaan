import * as React from 'react';

/**
 * Multi-line text entry — inspection notes, remarks, justifications.
 */
export interface TextAreaProps {
  label?: string;
  hint?: string;
  caption?: string;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  rows?: number;
  /** 80 | 120 | 160 in the source set. */
  minHeight?: number;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  showCount?: boolean;
  id?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
}
export declare const TextArea: React.FC<TextAreaProps>;
