import * as React from 'react';

/**
 * Pre-flight device checks before capture: scanner, camera, driver, connection.
 * Every row states its own outcome in words.
 */
export interface DeviceReadinessProps {
  checks?: Array<{ label: string; status?: 'ok' | 'fail' | 'pending'; note?: string }>;
  title?: string;
  mode?: 'list' | 'compact';
}
export declare const DeviceReadiness: React.FC<DeviceReadinessProps>;
