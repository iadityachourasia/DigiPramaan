import * as React from 'react';

/**
 * Page controls under a table or result list, with the record range in words
 * so the user knows where they are.
 */
export interface PaginationProps {
  page?: number;
  totalPages?: number;
  totalItems?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  showRange?: boolean;
  size?: 'S' | 'M';
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}
export declare const Pagination: React.FC<PaginationProps>;
