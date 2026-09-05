import * as React from 'react';

/**
 * Time entry with hour / minute / period columns.
 * Pair with DatePicker for a date-and-time slot.
 */
export interface TimePickerProps {
  label?: string;
  value?: string;
  status?: 'default' | 'error' | 'success' | 'warning' | 'info';
  caption?: string;
  open?: boolean;
  use24Hour?: boolean;
  selected?: { h: number; m: number; p?: 'AM' | 'PM' };
  disabled?: boolean;
  onSelect?: (v: { h: number; m: number; p?: string }) => void;
}
export declare const TimePicker: React.FC<TimePickerProps>;
