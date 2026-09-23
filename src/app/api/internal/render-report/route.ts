import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { renderDocxV2, renderPdfV2 } from "@/lib/server/report-render-v2";
import type { RenderReportInputV2 } from "@/types/report-v2";

/**
 * POST /api/internal/render-report — the F-003 fix (2026-09-19).
 *
 * The FastAPI backend's own Docker image has no Node runtime and never
 * will (its build context is `backend/` only, by design — see
 * `backend/app/jobs/reports.py`'s own module docstring). The renderer
 * (`@/lib/server/report-render-v2`) already lives here, in the Next.js
 * app that's already deployed with a working Node runtime — so instead
 * of shelling out to a script the backend container can't run, the
 * backend now calls this route directly over HTTPS.
 *
 * Deliberately OUTSIDE the `ENABLE_MOCK_API` lockdown (`src/proxy.ts`):
 * this was never mock data, it's real service-to-service infrastructure
 * with its own trust boundary — a shared secret, checked here, not the
 * mock-mode gate. `src/proxy.ts` passes `/api/internal/*` through
 * unconditionally; this route is what actually enforces access.
 *
 * The evidence images the old subprocess read from shared-filesystem
 * paths now arrive as base64 bytes in the request body (this process
 * shares no filesystem with the backend's container) and are written to
 * this invocation's own temp directory just long enough for
 * `renderPdfV2`/`renderDocxV2` to read them back — those functions still
 * take file paths, unchanged, so nothing in report-render-v2/ itself
 * needed to change.
 */

const LOGO_PATH = path.join(process.cwd(), "public", "images", "digi-pramaan-logo-report.jpg");

interface RenderReportBody {
  snapshot: unknown;
  images: {
    front: string | null;
    back: string | null;
    side_pdp: string | null;
    violationCrops: Record<string, string>;
    dimensions: Record<string, [number, number]>;
  };
}

async function writeTempImage(dir: string, name: string, base64: string | null): Promise<string | null> {
  if (!base64) return null;
  const filePath = path.join(dir, name);
  await writeFile(filePath, Buffer.from(base64, "base64"));
  return filePath;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.INTERNAL_RENDER_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }

  const body = (await request.json()) as RenderReportBody;
  const workDir = path.join(tmpdir(), `report-render-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const violationCropEntries = await Promise.all(
      Object.entries(body.images.violationCrops ?? {}).map(async ([ref, base64], index) => {
        const filePath = await writeTempImage(workDir, `crop-${index}.jpg`, base64);
        return [ref, filePath] as const;
      })
    );

    const input: RenderReportInputV2 = {
      snapshot: body.snapshot as RenderReportInputV2["snapshot"],
      images: {
        front: await writeTempImage(workDir, "front.jpg", body.images.front),
        back: await writeTempImage(workDir, "back.jpg", body.images.back),
        side_pdp: await writeTempImage(workDir, "side_pdp.jpg", body.images.side_pdp),
        violationCrops: Object.fromEntries(
          violationCropEntries.filter(([, filePath]) => filePath !== null) as [string, string][]
        ),
        dimensions: body.images.dimensions ?? {},
      },
      logoPath: LOGO_PATH,
    };

    const [pdf, docx] = await Promise.all([renderPdfV2(input), renderDocxV2(input)]);

    return NextResponse.json({
      pdfBase64: pdf.toString("base64"),
      docxBase64: docx.toString("base64"),
    });
  } catch (error: unknown) {
    // Never include the secret or raw request details in the error body.
    const message = error instanceof Error ? error.message : "Render failed";
    return NextResponse.json({ error: { code: "RENDER_FAILED", message } }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
