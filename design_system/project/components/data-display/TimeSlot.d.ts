import * as React from 'react';

/**
 * Appointment-slot picker grouped by part of day. Availability is written out,
 * not implied by a greyed-out box alone.
 */
export interface TimeSlotProps {
  groups?: Array<{ label: string; slots: Array<{ time: string; value?: string; remaining?: number; disabled?: boolean }> }>;
  selected?: string;
  onSelect?: (value: string) => void;
}
export declare const TimeSlot: React.FC<TimeSlotProps>;
