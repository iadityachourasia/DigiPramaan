/**
 * Hooks barrel. Import from "@/lib/hooks" instead of individual files.
 */

export {
  useActivityLog,
  ACTIVITY_MULTI_KEYS,
  type ActivityMultiKey,
} from "./useActivityLog";
export { useAnalyticsData } from "./useAnalyticsData";
export { useAuth, usePermission, useHasRole } from "./useAuth";
export { useCaptureSlots } from "./useCaptureSlots";
export { useComplianceRecord } from "./useComplianceRecord";
export { useDebounce } from "./useDebounce";
export {
  useGrievanceForm,
  useGrievanceLookup,
  type GrievanceFields,
  type UseGrievanceFormResult,
  type UseGrievanceLookupResult,
} from "./useGrievanceForm";
export { useManufacturers, useManufacturerScorecard } from "./useManufacturers";
export { useMobileHandoffSession } from "./useMobileHandoffSession";
export { useRecordDetail } from "./useRecordDetail";
export {
  useReportBuilder,
  useReportHistory,
  scopeFromParams,
  type UseReportBuilderResult,
} from "./useReports";
export { MULTI_FILTER_KEYS, useRecordsList, type MultiFilterKey } from "./useRecordsList";
export { useScanPipeline } from "./useScanPipeline";
export {
  useMediaQuery,
  useIsTabletOrAbove,
  useIsDesktop,
  usePrefersReducedMotion,
} from "./useMediaQuery";
