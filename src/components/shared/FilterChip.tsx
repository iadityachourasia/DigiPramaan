/**
 * FilterChip — one active, individually removable filter value
 * (05-compliance-records.md §2/§5). No dedicated `ux4g-chip` class exists
 * in the compiled stylesheet (confirmed absent) — a tonal tag is the real,
 * general-purpose "small removable value" building block already reused
 * for badges elsewhere (ConfidenceBadge, FieldSourceBadges), so this
 * follows the same precedent rather than inventing new markup.
 *
 * The remove button is sized to the 44×44px minimum touch target via
 * padding on the invisible hit area, not the visible chip height —
 * `05-compliance-records.md` §5 calls this out explicitly.
 */

export interface FilterChipProps {
  label: string;
  onRemove: () => void;
  removeLabel: string;
}

export function FilterChip({ label, onRemove, removeLabel }: FilterChipProps) {
  return (
    <span className="ux4g-tag-tonal-primary ux4g-tag-s lmcs-filter-chip">
      <span className="ux4g-label-s-default">{label}</span>
      <button
        type="button"
        className="lmcs-filter-chip-remove"
        onClick={onRemove}
        aria-label={removeLabel}
      >
        <span className="ux4g-icon-outlined" aria-hidden="true">
          close
        </span>
      </button>
    </span>
  );
}
