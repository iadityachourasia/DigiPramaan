import { NextResponse } from "next/server";

import { activityRegions, listActivity } from "@/lib/server/audit-store";
import { recordScanIdLabels } from "@/lib/server/scan-pipeline-store";
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_SORT_OPTIONS,
  type ActivityEventType,
  type ActivityFilters,
  type ActivitySort,
} from "@/types";

/**
 * GET /api/activity — the Global Activity Log's one read (13 §3.2).
 *
 * A real Route Handler for the same reason as every other list surface here:
 * the store is an in-memory log that only exists in this server process, so a
 * client-side branch could never see an event another tab produced.
 *
 * No server-side role check, matching every other handler in this mock
 * backend — the page and the nav gate on `activity.view`, and this trusts that
 * gate. Worth naming plainly given this endpoint returns an audit log: the
 * absence of server-side auth is an app-wide gap, not one this route
 * introduces.
 *
 * Multi-value filters repeat their key (`?types=a&types=b`), matching how
 * `/api/records` reads `RecordFilters` and how the URL carries filter state.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const filters: ActivityFilters = {
    actorUserIds: params.getAll("actorUserIds"),
    types: params
      .getAll("types")
      .filter((type): type is ActivityEventType =>
        ACTIVITY_EVENT_TYPES.includes(type as ActivityEventType)
      ),
    regions: params.getAll("regions"),
  };

  const dateFrom = params.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo = params.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;
  const recordId = params.get("recordId");
  if (recordId) filters.recordId = recordId;

  const sortParam = params.get("sort");
  const sort: ActivitySort = ACTIVITY_SORT_OPTIONS.includes(sortParam as ActivitySort)
    ? (sortParam as ActivitySort)
    : "newest";

  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.max(1, Number(params.get("pageSize")) || 20);

  return NextResponse.json({
    ...listActivity(filters, sort, page, pageSize),
    /* Sent with the page so the region filter offers only values the log
     * actually contains, rather than every inspection region in the country. */
    availableRegions: activityRegions(),
    /* Record id → scan id. Sent from the server because a live-created
     * record exists only in this process, so a client building this map from
     * the seed set alone would show a raw `rec-…` id for every record made in
     * this session. */
    recordLabels: recordScanIdLabels(),
  });
}
