/**
 * RepeatViolationFlag — the repeat-violation notice (09 §2, §4).
 *
 * Two rules from the spec drive everything here:
 *
 * 1. There is NO inverse. A manufacturer below the threshold renders
 *    nothing — not a green "clear" pill, not a "no violations" badge. A
 *    clear badge on a government screen reads as a certification, and this
 *    system does not issue one. That's why this returns `null` rather than
 *    a positive variant.
 * 2. The label carries the meaning, not the colour. 09 §5 asks for reliance
 *    on clear wording ("3 Non-Compliant records in the last 90 days") rather
 *    than a heavy colour wash, so this is a bordered strip with an icon and
 *    a full sentence — the same treatment the Dashboard's alerts use.
 *
 * The count and window both come from `REPEAT_VIOLATION_THRESHOLD` via the
 * caller's interpolated message, so the copy can't drift from the rule that
 * produced the flag.
 */

export interface RepeatViolationFlagProps {
  flagged: boolean;
  /** Full sentence, already interpolated with the live count and window. */
  message: string;
  /** Short heading, e.g. "Repeat violations". */
  title: string;
}

export function RepeatViolationFlag({ flagged, message, title }: RepeatViolationFlagProps) {
  if (!flagged) return null;

  return (
    <div className="ux4g-alert ux4g-alert-error" role="status">
      <span className="ux4g-icon-outlined ux4g-alert-icon" aria-hidden="true">
        error
      </span>
      <div className="ux4g-alert-content">
        <span className="ux4g-alert-title">{title}</span>
        <span className="ux4g-alert-message">{message}</span>
      </div>
    </div>
  );
}
