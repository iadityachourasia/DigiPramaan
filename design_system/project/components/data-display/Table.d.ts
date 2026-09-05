import * as React from 'react';

/**
 * Row-and-column data: scanned products, inspection history, case lists.
 * Cells accept nodes, so Tag, Avatar, Thumbnail and Button drop straight in.
 */
export interface TableProps {
  columns?: Array<{ key: string; label: string; width?: string | number; align?: 'left' | 'right'; sortable?: boolean; sorted?: 'asc' | 'desc' | false }>;
  rows?: Array<Record<string, any> & { key?: string | number; rowLabel?: string }>;
  size?: 'S' | 'M';
  zebra?: 'none' | 'rows' | 'columns';
  selectable?: boolean;
  selectedKeys?: Array<string | number>;
  caption?: string;
  emptyState?: React.ReactNode;
  footer?: React.ReactNode;
  onToggleRow?: (key: string | number) => void;
  onToggleAll?: () => void;
}
export declare const Table: React.FC<TableProps>;
