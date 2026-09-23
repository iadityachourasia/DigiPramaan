import Image from "next/image";

/**
 * DigiPramaanLogo — the single source of truth for the product mark.
 *
 * Every navigation/sign-in surface previously repeated its own
 * `<Image src="/images/digi-pramaan-logo.png" ... />` markup, each wrapped in
 * a `.lmcs-brand-mark` tile that carried a purple/violet tint
 * (`--ux4g-bg-primary-subtle`) baked into the shared CSS class — not the PNG
 * itself, which is fully transparent (verified: RGBA with alpha 0-255,
 * corners and centre both fully transparent). This component centralises
 * that markup on the canonical asset and a neutral, theme-aware surface
 * (`--ux4g-bg-neutral-elevated` — white in light mode) so no placement can
 * drift back to a coloured tile.
 *
 * `size` maps to real pixel dimensions rather than a CSS class so
 * `next/image` always receives the true intrinsic box up front — no layout
 * shift while the image loads. The asset is square (1536x1536), so a single
 * dimension preserves aspect ratio without distortion.
 */

const SIZE_PX = {
  sm: 32,
  md: 40,
  nav: 64,
  lg: 112,
} as const;

export type DigiPramaanLogoSize = keyof typeof SIZE_PX;

export interface DigiPramaanLogoProps {
  /** sm: sidebar. md: standard brand. nav: landing masthead. lg: auth/sign-in. */
  size?: DigiPramaanLogoSize;
  /** Extra class appended to the existing `.lmcs-brand-mark` tile, for
   * per-surface padding/radius variants (e.g. `lmcs-brand-mark-login`). */
  className?: string;
  /**
   * Most placements sit directly beside visible text that already reads
   * "DigiPramaan" (the app name label) — marking the image decorative
   * (empty alt) avoids a screen reader announcing the name twice, which is
   * this project's existing convention for every prior logo instance.
   * Pass `false` for a placement with no adjacent "DigiPramaan" text.
   */
  decorative?: boolean;
}

export function DigiPramaanLogo({
  size = "md",
  className,
  decorative = true,
}: DigiPramaanLogoProps) {
  const px = SIZE_PX[size];

  return (
    <span className={`lmcs-brand-mark${className ? ` ${className}` : ""}`}>
      <Image
        src="/images/digi-pramaan-logo.png"
        alt={decorative ? "" : "DigiPramaan"}
        width={px}
        height={px}
      />
    </span>
  );
}
