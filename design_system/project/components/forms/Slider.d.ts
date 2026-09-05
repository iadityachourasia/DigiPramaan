import * as React from 'react';

/**
 * Coarse numeric selection where the exact number matters less than the
 * relative position. Always shows the live value as text next to the track.
 */
export interface SliderProps {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  size?: 'S' | 'M';
  showTicks?: boolean;
  showValues?: boolean;
  unit?: string;
  disabled?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}
export declare const Slider: React.FC<SliderProps>;
