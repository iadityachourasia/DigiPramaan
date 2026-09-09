import { NextResponse } from "next/server";
import { managedUsersForAdmin } from "@/lib/server/admin-store";
import { listRecords } from "@/lib/server/scan-pipeline-store";
import type { RecordFilters } from "@/types";

const EMPTY: RecordFilters = { categories: [], complianceStatuses: [], regions: [], manufacturers: [], sources: [], violationCategoryIds: [], batchIds: [] };
const PAGE_SIZE = 200;

/**
 * Every record the requesting admin can see, jurisdiction-scoped and fully
 * paginated. Not `listRecords(EMPTY, ..., viewerId)` with a fixed page size:
 * this powers case-load counts on the Team & Jurisdiction tab, and an
 * unscoped or truncated read here would (a) leak case volume from outside
 * the admin's own jurisdiction into their own team screen and (b)
 * silently under-count once the system holds more than one page of
 * records.
 */
function allVisibleRecords(viewerId: string) {
  const first = listRecords(EMPTY, "newest", 1, PAGE_SIZE, viewerId);
  const rows = [...first.rows];
  for (let page = 2; rows.length < first.totalCount; page++) {
    rows.push(...listRecords(EMPTY, "newest", page, PAGE_SIZE, viewerId).rows);
  }
  return rows;
}

export async function GET(request: Request) {
  const viewerId = new URL(request.url).searchParams.get("viewerId");
  if (!viewerId) return NextResponse.json({ error: "viewerId is required" }, { status: 400 });
  const records = allVisibleRecords(viewerId);
  const loads = new Map<string, number>();
  for (const record of records) if (record.assignedOfficerUserId) loads.set(record.assignedOfficerUserId, (loads.get(record.assignedOfficerUserId) ?? 0) + 1);
  const users = managedUsersForAdmin(viewerId, loads);
  return users ? NextResponse.json({ users }) : NextResponse.json({ error: "Admin access required" }, { status: 403 });
}
