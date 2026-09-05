import * as React from 'react';

/**
 * State/UT-level geographic view. Ships the legend, selection and the equivalent
 * data table; the map geometry itself must be supplied from the source file.
 */
export interface MapOfIndiaProps {
  /** The India SVG or <img> from the source file. Required — nothing is drawn for you. */
  map?: React.ReactNode;
  regions?: Array<{ name: string; code?: string; value: number | string; band?: string }>;
  selected?: string;
  legend?: Array<{ label: string; color: string }>;
  title?: string;
  unit?: string;
  showTable?: boolean;
  onSelectRegion?: (code: string) => void;
}
export declare const MapOfIndia: React.FC<MapOfIndiaProps>;
