import { NextResponse } from "next/server";

import { listRecords } from "@/lib/server/scan-pipeline-store";
import { RECORD_SORT_OPTIONS, type RecordFilters, type RecordSort } from "@/types";

/**
 * GET /api/records — the list/filter/sort/paginate read path for
 * Compliance Records (page 5). A real Route Handler, not a client-side
 * mock branch — `listRecords()` reads `scan-pipeline-store.ts`'s in-memory
 * `runs` Map, which only exists in this server process, so a client
 * component can't call it directly (same reason page 4's single-record
 * reads/writes go through `/api/records/[id]`).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const filters: RecordFilters = {
    categories: params.getAll("categories") as RecordFilters["categories"],
    complianceStatuses: params.getAll(
      "complianceStatuses"
    ) as RecordFilters["complianceStatuses"],
    regions: params.getAll("regions"),
    manufacturers: params.getAll("manufacturers"),
    sources: params.getAll("sources") as RecordFilters["sources"],
    violationCategoryIds: params.getAll(
      "violationCategoryIds"
    ) as RecordFilters["violationCategoryIds"],
    ...(params.get("query") ? { query: params.get("query")! } : {}),
    ...(params.get("dateFrom") ? { dateFrom: params.get("dateFrom")! } : {}),
    ...(params.get("dateTo") ? { dateTo: params.get("dateTo")! } : {}),
  };

  const sortParam = params.get("sort");
  const sort: RecordSort = RECORD_SORT_OPTIONS.includes(sortParam as RecordSort)
    ? (sortParam as RecordSort)
    : "newest";

  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.max(1, Number(params.get("pageSize")) || 20);

  return NextResponse.json(listRecords(filters, sort, page, pageSize));
}
