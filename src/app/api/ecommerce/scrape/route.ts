import { NextResponse } from "next/server";

import { scrapeCategory, scrapeListing } from "@/lib/server/ecommerce-store";

interface ScrapeBody {
  url?: unknown;
  mode?: unknown;
}

/**
 * POST /api/ecommerce/scrape — fetch a listing (single mode) or the
 * listings found on a category/search page (bulk mode), for the preview
 * step 08 §2 requires before anything is committed to a scan.
 *
 * Failures come back as a 200 with a named `failure` rather than an HTTP
 * error: 08 §5 wants each of these to read as its own specific message
 * ("Couldn't identify a product on this page", a rate-limit explanation),
 * never a generic error the caller has to guess at.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as ScrapeBody;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const mode = body.mode === "bulk" ? "bulk" : "single";

  if (!url) {
    return NextResponse.json({ ok: false, failure: "invalid_url" });
  }

  return NextResponse.json(mode === "bulk" ? scrapeCategory(url) : scrapeListing(url));
}
