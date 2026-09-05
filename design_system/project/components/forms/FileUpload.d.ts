import * as React from 'react';

/**
 * Dropzone plus uploaded-file list — scan images, lab reports, licence documents.
 * File-type glyphs come from the source's file-type icon family.
 */
export interface FileUploadProps {
  label?: string;
  hint?: string;
  files?: Array<{ name: string; size?: string; state?: 'done' | 'uploading' | 'error'; progress?: number; error?: string }>;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  caption?: string;
  multiple?: boolean;
  disabled?: boolean;
  onRemove?: (index: number) => void;
}
export declare const FileUpload: React.FC<FileUploadProps>;
