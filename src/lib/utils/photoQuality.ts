"use client";

import type { PhotoQualityHint } from "@/types";

/**
 * photoQuality.ts — the citizen portal's advisory photo check (page 11 §4).
 *
 * THIS IS NOT PAGE 3's QUALITY GATE, AND DELIBERATELY DOES NOT CALL IT
 * ---------------------------------------------------------------------
 * `checkImageQuality` in `lib/api/scans.ts` returns a pass/fail verdict whose
 * failure means the photo is rejected and deleted server-side. Page 11 §4 and
 * BRD FR-FORM-03 both require the opposite: a blurry or dark photo produces a
 * gentle suggestion and never blocks submission. Calling a gate and then
 * ignoring its verdict would be dishonest instrumentation, and its failure
 * vocabulary (blur / distortion / curvature / no_text_detected) is a different
 * vocabulary from `PhotoQualityHint`'s (blurry / dark) anyway.
 *
 * This also does real work, which the officer-side gate currently does not:
 * that one is mocked to always pass unless a demo parameter forces a failure,
 * so it never inspects the file. Here a genuinely dark or blurry photo really
 * does raise the advisory, which means the state is reachable with a bad photo
 * rather than only with a URL parameter.
 *
 * Runs entirely in the browser on a downscaled copy. No upload, no backend,
 * no dependency.
 */

/** Analysis runs on a small copy — enough signal, negligible cost. */
const SAMPLE_EDGE = 96;

/**
 * Mean luminance below this reads as an underexposed photo. Empirical: a
 * label photographed in poor shop lighting lands well under it, while a
 * legibly-lit one sits far above.
 */
const DARK_LUMINANCE_THRESHOLD = 55;

/**
 * Variance of the Laplacian below this reads as out of focus. The standard
 * cheap sharpness proxy: a crisp photo has strong local intensity changes at
 * edges, a blurred one has them smeared away.
 */
const BLUR_VARIANCE_THRESHOLD = 90;

const SHARP: PhotoQualityHint = { isLikelyPoorQuality: false };

/** Greyscale intensities of the downscaled image, or null when it cannot be read. */
async function toGreyscaleSample(
  file: File
): Promise<{ data: Float32Array; width: number; height: number } | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return null;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    /* A tainted canvas throws. Nothing to analyse, so raise no hint. */
    return null;
  }

  const data = new Float32Array(width * height);
  for (let index = 0; index < data.length; index += 1) {
    const offset = index * 4;
    /* Rec. 601 luma — the usual perceptual weighting, not a flat average. */
    data[index] =
      0.299 * pixels[offset]! + 0.587 * pixels[offset + 1]! + 0.114 * pixels[offset + 2]!;
  }

  return { data, width, height };
}

function meanLuminance(data: Float32Array): number {
  let total = 0;
  for (const value of data) total += value;
  return total / data.length;
}

/** Variance of a 4-neighbour Laplacian — high for a crisp image, low for a blurred one. */
function laplacianVariance(data: Float32Array, width: number, height: number): number {
  const responses: number[] = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      responses.push(
        4 * data[index]! -
          data[index - 1]! -
          data[index + 1]! -
          data[index - width]! -
          data[index + width]!
      );
    }
  }

  if (responses.length === 0) return Number.POSITIVE_INFINITY;

  const mean = responses.reduce((sum, value) => sum + value, 0) / responses.length;
  return (
    responses.reduce((sum, value) => sum + (value - mean) ** 2, 0) / responses.length
  );
}

/**
 * Inspects a photo and reports whether it is worth suggesting a retake.
 *
 * Never throws and never blocks. Anything it cannot analyse — an unreadable
 * file, a browser without `createImageBitmap`, a tainted canvas — returns "no
 * hint" rather than a warning, because a false accusation that a citizen's
 * photo is bad is worse than staying quiet.
 *
 * Darkness is checked before blur: an underexposed photo also measures as
 * low-contrast, so reporting blur there would name the wrong problem and send
 * the citizen off to fix the wrong thing.
 */
export async function inspectPhotoQuality(file: File): Promise<PhotoQualityHint> {
  const sample = await toGreyscaleSample(file);
  if (!sample) return SHARP;

  if (meanLuminance(sample.data) < DARK_LUMINANCE_THRESHOLD) {
    return { isLikelyPoorQuality: true, reason: "dark" };
  }

  if (laplacianVariance(sample.data, sample.width, sample.height) < BLUR_VARIANCE_THRESHOLD) {
    return { isLikelyPoorQuality: true, reason: "blurry" };
  }

  return SHARP;
}
