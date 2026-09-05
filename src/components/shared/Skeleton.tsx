/**
 * Skeleton — a loading placeholder built from confirmed UX4G tokens.
 *
 * The package ships `.ux4g-skeleton-*` classes, but every one of them is
 * scoped under a `.ux4g-application-submission` ancestor and does nothing
 * standalone — confirmed by reading the compiled stylesheet, not assumed.
 * Rather than invent a token to work around that, this composes the same
 * fill (`--ux4g-bg-neutral-subtle`) and radii (`--ux4g-radius-sm/md/lg`) the
 * package's own skeletons use, so a real theme change still repaints this
 * correctly.
 *
 * 02-dashboard.md §4 requires a skeleton loader "on every card/chart/list —
 * never a blank page," independently per widget. These three shapes are the
 * building blocks each widget's loading state composes from.
 */

export interface SkeletonProps {
  /** CSS width, e.g. "100%" or "3rem". */
  width?: string;
  /** CSS height, e.g. "1rem". */
  height?: string;
  shape?: "block" | "circle";
  className?: string;
}

const RADIUS_BY_SHAPE = {
  block: "var(--ux4g-radius-sm)",
  circle: "var(--ux4g-radius-full)",
};

export function Skeleton({
  width = "100%",
  height = "1rem",
  shape = "block",
  className = "",
}: SkeletonProps) {
  return (
    <span
      className={`lmcs-skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: RADIUS_BY_SHAPE[shape] }}
      aria-hidden="true"
    />
  );
}

/** A single line of placeholder text at body size. */
export function SkeletonText({ width = "100%" }: { width?: string }) {
  return <Skeleton width={width} height="1rem" />;
}

/** A circular placeholder, e.g. for a thumbnail or avatar. */
export function SkeletonCircle({ size = "2.5rem" }: { size?: string }) {
  return <Skeleton width={size} height={size} shape="circle" />;
}
