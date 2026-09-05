import * as React from 'react';

/**
 * Date entry with the source's calendar panel. Field is read-only and opened by
 * the trailing calendar button, so the format cannot be mistyped.
 */
export interface DatePickerProps {
  label?: string;
  value?: string;
  placeholder?: string;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  caption?: string;
  open?: boolean;
  month?: string;
  /** 0 = Sunday. Index of the weekday the 1st falls on. */
  firstWeekday?: number;
  daysInMonth?: number;
  selectedDay?: number;
  today?: number;
  disabled?: boolean;
  onSelectDay?: (day: number) => void;
}
export declare const DatePicker: React.FC<DatePickerProps>;
