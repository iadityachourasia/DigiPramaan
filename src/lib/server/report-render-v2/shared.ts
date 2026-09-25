/**
 * report-render-v2/shared.ts — constants and pure helpers shared by the
 * PDF and DOCX renderers. Framework-agnostic: nothing here imports jsPDF
 * or docx, so both sides compute image fit/labels/dates/palette/type-scale
 * identically — the one place either renderer's visual language can drift
 * is if a call site reaches past these constants for its own numbers.
 */

import type { DeclarationRowV2, ImageReferenceV2 } from "@/types/report-v2";

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

/** Restrained, desaturated palette — "premium" here means typography,
 * spacing and imagery doing the work, never a bright/neon accent. Each
 * entry carries both an RGB triple (jsPDF's setTextColor(...)/
 * setFillColor(...) spread API) and a hex string (docx's color/shading
 * string params) so pdf.ts and docx.ts can never drift out of sync. */
export const PALETTE = {
  ink: { rgb: [24, 28, 38] as [number, number, number], hex: "181C26" },
  headingNavy: { rgb: [18, 32, 56] as [number, number, number], hex: "122038" },
  accentGold: { rgb: [140, 108, 28] as [number, number, number], hex: "8C6C1C" },
  hairline: { rgb: [206, 210, 217] as [number, number, number], hex: "CED2D9" },
  zebraFill: { rgb: [246, 247, 249] as [number, number, number], hex: "F6F7F9" },
  headerFill: { rgb: [230, 233, 238] as [number, number, number], hex: "E6E9EE" },
  subtleText: { rgb: [104, 110, 122] as [number, number, number], hex: "686E7A" },
} as const;

export interface StatusColorEntry {
  rgb: [number, number, number];
  hex: string;
  bgRgb: [number, number, number];
  bgHex: string;
}

/** Muted, restrained status colors — never neon, per the design brief.
 * `bg*` is a light filled-badge background, used by the pill/badge
 * treatment in both renderers. */
export const STATUS_COLOR: Record<string, StatusColorEntry> = {
  PASS: { rgb: [30, 92, 56], hex: "1E5C38", bgRgb: [227, 240, 231], bgHex: "E3F0E7" },
  FAIL: { rgb: [140, 36, 36], hex: "8C2424", bgRgb: [248, 228, 228], bgHex: "F8E4E4" },
  NEEDS_REVIEW: { rgb: [138, 96, 10], hex: "8A600A", bgRgb: [250, 238, 214], bgHex: "FAEED6" },
  INSUFFICIENT_EVIDENCE: { rgb: [124, 78, 32], hex: "7C4E20", bgRgb: [246, 233, 218], bgHex: "F6E9DA" },
  NOT_APPLICABLE: { rgb: [98, 98, 98], hex: "626262", bgRgb: [235, 235, 235], bgHex: "EBEBEB" },
};

/** Named type scale (pt) — both renderers reference this instead of
 * scattering their own magic numbers. */
export const TYPE_SCALE = { title: 24, h1: 15, h2: 12, h3: 10.5, body: 9.5, small: 8, micro: 7.5 };

/** Named spacing scale (pt). */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 18, xl: 28 };

/** Vendored, embeddable font files (both OFL-1.1) — see
 * public/fonts/report/LICENSE-OFL.txt. Source Serif 4 for headings/cover,
 * Inter for body copy. File names only; each renderer resolves the full
 * path against its own runtime's public/ directory convention. */
export const FONT_FILES = {
  interRegular: "Inter-Regular.ttf",
  interMedium: "Inter-Medium.ttf",
  interSemiBold: "Inter-SemiBold.ttf",
  interBold: "Inter-Bold.ttf",
  serifRegular: "SourceSerif4-Regular.ttf",
  serifSemiBold: "SourceSerif4-SemiBold.ttf",
  serifBold: "SourceSerif4-Bold.ttf",
} as const;

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function angleLabel(angle: string): string {
  return (
    { front: "Front", back: "Back", side_pdp: "Principal Display Panel", additional: "Additional" }[angle] ?? angle
  );
}

/** Groups a record's full, uncapped image list by angle (front, back,
 * side_pdp, additional, then any other angle in first-seen order), each
 * group sorted chronologically by uploadedAt so recaptures read as a
 * sequence (earliest attempt -> final accepted capture) — the whole point
 * of no longer silently dropping every recapture but the last. */
export function groupImagesByAngle(images: ImageReferenceV2[]): [string, ImageReferenceV2[]][] {
  const order = ["front", "back", "side_pdp", "additional"];
  const groups = new Map<string, ImageReferenceV2[]>();
  for (const ref of images) {
    const group = groups.get(ref.angle);
    if (group) group.push(ref);
    else groups.set(ref.angle, [ref]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.uploadedAt ?? "").localeCompare(b.uploadedAt ?? ""));
  }
  const angles = [...groups.keys()].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return angles.map((angle) => [angle, groups.get(angle)!]);
}

/** Human status for a declaration row — mirrors the existing
 * responsible-entities convention (corrected takes priority over
 * not-detected, which takes priority over the plain as-extracted case). */
export function declarationStatusLabel(row: DeclarationRowV2): string {
  if (row.corrected) return "Officer-Corrected";
  if (row.notDetected) return "Not Detected";
  return "As Extracted";
}

/** Reference label for a declaration's cited evidence, or an em-dash when
 * no evidence image is linked. */
export function declarationEvidenceLabel(row: DeclarationRowV2): string {
  if (!row.evidenceImageId) return "—";
  return `${row.evidenceAngle ? angleLabel(row.evidenceAngle) : "Evidence"} · ${row.evidenceImageId.slice(0, 8)}`;
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
