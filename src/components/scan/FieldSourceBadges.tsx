import type { ExtractedDeclaration } from "@/types";

/**
 * FieldSourceBadges — the two per-field provenance badges
 * (13-history-and-hierarchy.md §1.1): which photographed face a value came
 * from, and which engine produced it. A trust feature, not a status — the
 * image badge uses the lowest-emphasis "outline" tag (it's also a button,
 * opening the source-image drawer); the engine badge uses the even quieter
 * "text" tag variant, since it is metadata nobody needs to act on.
 */

export interface FieldSourceBadgesProps {
  sourceImageAngle: ExtractedDeclaration["sourceImageAngle"];
  sourceEngine: ExtractedDeclaration["sourceEngine"];
  labels: {
    angle: (angle: ExtractedDeclaration["sourceImageAngle"]) => string;
    engine: (engine: ExtractedDeclaration["sourceEngine"]) => string;
    viewImage: string;
  };
  onViewImage: () => void;
}

export function FieldSourceBadges({
  sourceImageAngle,
  sourceEngine,
  labels,
  onViewImage,
}: FieldSourceBadgesProps) {
  return (
    <span className="lmcs-field-source-badges">
      <button
        type="button"
        className="ux4g-tag-outline-neutral ux4g-tag-s lmcs-field-source-badge-btn"
        onClick={onViewImage}
        aria-label={`${labels.viewImage}: ${labels.angle(sourceImageAngle)}`}
      >
        <span className="ux4g-icon-outlined" aria-hidden="true">
          photo_camera
        </span>
        <span className="ux4g-label-s-default">{labels.angle(sourceImageAngle)}</span>
      </button>
      <span className="ux4g-tag-text-neutral ux4g-tag-s">
        <span className="ux4g-icon-outlined" aria-hidden="true">
          document_scanner
        </span>
        <span className="ux4g-label-s-default">{labels.engine(sourceEngine)}</span>
      </span>
    </span>
  );
}
