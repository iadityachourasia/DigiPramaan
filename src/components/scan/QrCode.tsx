"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { useTheme } from "@/lib/theme";

/**
 * QrCode — renders a QR code as an SVG, coloured from live UX4G tokens rather
 * than invented hex values. SVG libraries need literal colour values, so the
 * component rereads the tokens whenever the active theme changes.
 *
 * UX4G ships no QR-rendering component or token family (confirmed — no
 * `.ux4g-*qr*` class exists in the compiled stylesheet) — this is pure
 * application logic using the small `qrcode` package, wrapped so no other
 * file needs to know how the SVG gets built.
 */

export interface QrCodeProps {
  /** The URL or text to encode. */
  value: string;
  /** Rendered size in pixels, square. */
  size?: number;
}

export function QrCode({ value, size = 176 }: QrCodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const theme = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;
    const style = getComputedStyle(containerRef.current);
    const dark =
      style.getPropertyValue("--ux4g-text-neutral-primary").trim() || "#171717";
    const light =
      style.getPropertyValue("--ux4g-bg-neutral-elevated").trim() || "#ffffff";

    let cancelled = false;
    QRCode.toString(value, {
      type: "svg",
      margin: 1,
      color: { dark, light },
    }).then((markup) => {
      if (!cancelled) setSvg(markup);
    });

    return () => {
      cancelled = true;
    };
  }, [value, theme]);

  return (
    <div
      ref={containerRef}
      className="lmcs-qr-code"
      style={{ width: size, height: size }}
      role="img"
      aria-label="QR code — scan with your phone's camera to continue this scan on mobile"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
