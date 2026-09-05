/**
 * Hooks barrel. Import from "@/lib/hooks" instead of individual files.
 */

export { useAuth, usePermission, useHasRole } from "./useAuth";
export { useDebounce } from "./useDebounce";
export {
  useMediaQuery,
  useIsTabletOrAbove,
  useIsDesktop,
  usePrefersReducedMotion,
} from "./useMediaQuery";
