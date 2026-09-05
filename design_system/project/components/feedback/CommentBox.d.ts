import * as React from 'react';

/**
 * Remarks thread on a record — officer notes, clarification requests, replies.
 * Every entry carries author, role and timestamp.
 */
export interface CommentBoxProps {
  comments?: Array<{ author: string; role?: string; time: string; text: string }>;
  placeholder?: string;
  submitLabel?: string;
  maxLength?: number;
  onSubmit?: () => void;
}
export declare const CommentBox: React.FC<CommentBoxProps>;
