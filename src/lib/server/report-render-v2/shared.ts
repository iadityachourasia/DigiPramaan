/**
 * report-render-v2/shared.ts — constants and pure helpers shared by the
 * PDF and DOCX renderers. Framework-agnostic: nothing here imports jsPDF
 * or docx, so both sides compute image fit/labels/dates identically.
 */

export const GOVERNMENT = "Government of India";
export const MINISTRY = "Ministry of Consumer Affairs, Food & Public Distribution";
export const DEPARTMENT = "Department of Consumer Affairs";
export const REPORT_TITLE = "Compliance Inspection Report";

export const STATUS_LABEL: Record<string, string> = {
  PASS: "PASS",
  FAIL: "FAIL",
  NEEDS_REVIEW: "NEEDS REVIEW",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT EVIDENCE",
  NOT_APPLICABLE: "NOT APPLICABLE",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function angleLabel(angle: string): string {
  return { front: "Front", back: "Back", side_pdp: "Principal Display Panel" }[angle] ?? angle;
}

/** Scales (naturalW, naturalH) to fit within (maxW, maxH), preserving
 * aspect ratio, never upscaling past the natural size. */
export function fitDimensions(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
  return { width: naturalW * scale, height: naturalH * scale };
}

/** Scales a pixel-space bbox from the ORIGINAL image's dimensions onto a
 * drawn box of (drawnW, drawnH) placed at (drawnX, drawnY) — used to
 * overlay the evidence rectangle on top of the (possibly resized) image
 * actually embedded. Returns null if the original dimensions aren't
 * known (older/degraded evidence — never guesses a scale). */
export function scaleBboxToDrawnBox(
  bbox: number[],
  originalWidthPx: number | null,
  originalHeightPx: number | null,
  drawnX: number,
  drawnY: number,
  drawnW: number,
  drawnH: number
): { x: number; y: number; w: number; h: number } | null {
  if (!originalWidthPx || !originalHeightPx || bbox.length !== 4) return null;
  const [x0, y0, x1, y1] = bbox as [number, number, number, number];
  const scaleX = drawnW / originalWidthPx;
  const scaleY = drawnH / originalHeightPx;
  return {
    x: drawnX + x0 * scaleX,
    y: drawnY + y0 * scaleY,
    w: (x1 - x0) * scaleX,
    h: (y1 - y0) * scaleY,
  };
}
