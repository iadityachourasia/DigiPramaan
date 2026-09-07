import { beforeEach, describe, expect, it } from "vitest";

import {
  activityForRecord,
  activityRegions,
  emitActivityEvent,
  ensureSeeded,
  listActivity,
  projectAuditTrail,
  resetAuditStoreForTests,
} from "@/lib/server/audit-store";
import { MOCK_ACTIVE_RECORDS } from "@/lib/mock/records";
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_TO_AUDIT_TYPE,
  CITIZEN_ACTOR_FILTER,
  CITIZEN_ACTOR_ID,
  SYSTEM_ACTOR_FILTER,
  type ActivityFilters,
} from "@/types";

/**
 * The audit trail had zero test coverage before this file, across every
 * surface that reads it — which is uncomfortable given two of those readers
 * use it as logic input rather than display.
 */
describe("audit store", () => {
  beforeEach(() => {
    resetAuditStoreForTests();
  });

  it("returns one record's events oldest first, whatever order they arrived in", () => {
    emitActivityEvent({ recordId: "r1", type: "confirm_and_verify", at: "2026-03-02T10:00:00Z" });
    emitActivityEvent({ recordId: "r1", type: "scan_created", at: "2026-03-01T10:00:00Z" });
    emitActivityEvent({ recordId: "r2", type: "scan_created", at: "2026-03-01T11:00:00Z" });

    const events = activityForRecord("r1");

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual(["scan_created", "confirm_and_verify"]);
  });

  /*
   * Not cosmetic. `verifierOf()` reverse-finds the last Verified event to name
   * the officer on a PDF, and page 6 renders the array with no sort of its
   * own — newest-first would silently break both.
   */
  it("keeps chronological order across many events on one record", () => {
    for (let day = 9; day >= 1; day -= 1) {
      emitActivityEvent({
        recordId: "r1",
        type: "field_corrected",
        at: `2026-03-0${day}T10:00:00Z`,
      });
    }

    const dates = activityForRecord("r1").map((event) => event.createdAt);
    expect(dates).toEqual([...dates].sort());
  });

  it("mints a unique id per event", () => {
    for (let i = 0; i < 50; i += 1) {
      emitActivityEvent({ recordId: "r1", type: "report_generated" });
    }
    const ids = activityForRecord("r1").map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("omits the actor entirely for system-driven events", () => {
    emitActivityEvent({ recordId: "r1", type: "ocr_completed" });
    const [event] = activityForRecord("r1");
    expect(event?.actorUserId).toBeUndefined();
    expect(event?.actorRole).toBeUndefined();
  });

  it("resolves an officer's role from their id", () => {
    emitActivityEvent({ recordId: "r1", type: "confirm_and_verify", actorUserId: "usr-001" });
    expect(activityForRecord("r1")[0]?.actorRole).toBe("Enforcement Officer");
  });

  it("names a citizen submission as a citizen, never as the system", () => {
    emitActivityEvent({ recordId: "r1", type: "scan_created", actorUserId: CITIZEN_ACTOR_ID });
    const [entry] = projectAuditTrail("r1");
    expect(entry?.byUserName).toBe("Citizen report (public portal)");
    expect(entry?.byUserName).not.toBe("System");
  });

  describe("projection to the per-record timeline", () => {
    it("keeps machine-generated events out of it", () => {
      emitActivityEvent({ recordId: "r1", type: "scan_created", at: "2026-03-01T10:00:00Z" });
      emitActivityEvent({ recordId: "r1", type: "llm_structuring_completed", at: "2026-03-01T10:01:00Z" });
      emitActivityEvent({ recordId: "r1", type: "rule_engine_completed", at: "2026-03-01T10:02:00Z" });
      emitActivityEvent({ recordId: "r1", type: "confirm_and_verify", at: "2026-03-01T10:03:00Z" });

      expect(projectAuditTrail("r1").map((entry) => entry.type)).toEqual(["Scanned", "Verified"]);
    });

    /* Clearing a flag is logged centrally but must not add a timeline row,
     * since the coarse vocabulary has no word for it. */
    it("logs a cleared Needs Review flag without showing it on the timeline", () => {
      emitActivityEvent({ recordId: "r1", type: "flagged_needs_review", actorUserId: "usr-001" });
      emitActivityEvent({ recordId: "r1", type: "needs_review_cleared", actorUserId: "usr-001" });

      expect(activityForRecord("r1")).toHaveLength(2);
      expect(projectAuditTrail("r1").map((entry) => entry.type)).toEqual([
        "Flagged as Needs Review",
      ]);
    });

    it("carries the note through as the timeline's detail line", () => {
      emitActivityEvent({
        recordId: "r1",
        type: "flagged_needs_review",
        actorUserId: "usr-001",
        detail: "Second opinion wanted on the net quantity.",
      });
      expect(projectAuditTrail("r1")[0]?.note).toBe("Second opinion wanted on the net quantity.");
    });
  });

  describe("seed backfill", () => {
    beforeEach(() => {
      ensureSeeded();
    });

    it("gives every seeded record a history rather than an empty timeline", () => {
      for (const record of MOCK_ACTIVE_RECORDS) {
        expect(activityForRecord(record.id).length).toBeGreaterThan(0);
      }
    });

    /* Seeds carried only two distinct instants, so a four-event trail rendered
     * the same calendar date three times over. */
    it("spreads a verified record's events instead of stacking them on one instant", () => {
      const verified = MOCK_ACTIVE_RECORDS.find(
        (record) => record.verificationStatus === "Verified"
      );
      expect(verified).toBeDefined();

      const times = activityForRecord(verified!.id).map((event) => event.createdAt);
      expect(new Set(times).size).toBeGreaterThan(1);
    });

    it("names the officer on every seeded timeline entry that has one", () => {
      for (const record of MOCK_ACTIVE_RECORDS) {
        for (const entry of projectAuditTrail(record.id)) {
          if (entry.byUserId) expect(entry.byUserName).toBeTruthy();
        }
      }
    });

    it("records the region on seeded events, for the Activity Log's filter", () => {
      const record = MOCK_ACTIVE_RECORDS[0]!;
      expect(activityForRecord(record.id)[0]?.region).toBe(record.region);
    });
  });

  it("maps every declared activity type, so a new one cannot be forgotten", () => {
    for (const type of ACTIVITY_EVENT_TYPES) {
      expect(ACTIVITY_TO_AUDIT_TYPE).toHaveProperty(type);
    }
  });
});

/**
 * The Global Activity Log's query surface. Session 1 deliberately shipped no
 * cross-record read at all, so every one of these paths is new.
 *
 * `listActivity` seeds on first read the way `activityForRecord` does, so the
 * log always contains the 36 backfilled seed events. Rather than fight that,
 * these fixtures use values the seeds cannot produce — a region, an actor id
 * and an event type that appear nowhere in the backfill — so a filter on any
 * of them isolates exactly this test's data.
 */
describe("activity log query", () => {
  const NO_FILTERS: ActivityFilters = { actorUserIds: [], types: [], regions: [] };
  /** Seeds only ever use real Indian state names and real mock user ids. */
  const REGION_A = "Testland North";
  const REGION_B = "Testland South";
  const ONLY_A: ActivityFilters = { ...NO_FILTERS, regions: [REGION_A] };
  const ONLY_TEST: ActivityFilters = { ...NO_FILTERS, regions: [REGION_A, REGION_B] };

  beforeEach(() => {
    resetAuditStoreForTests();
    emitActivityEvent({ recordId: "r1", type: "scan_created", actorUserId: "usr-001", region: REGION_A, at: "2026-03-01T09:00:00Z" });
    emitActivityEvent({ recordId: "r1", type: "ocr_completed", region: REGION_A, at: "2026-03-01T09:01:00Z" });
    emitActivityEvent({ recordId: "r2", type: "scan_created", actorUserId: CITIZEN_ACTOR_ID, region: REGION_B, at: "2026-03-02T09:00:00Z" });
    emitActivityEvent({ recordId: "r2", type: "confirm_and_verify", actorUserId: "usr-002", region: REGION_B, at: "2026-03-03T09:00:00Z" });
    emitActivityEvent({ recordId: "r3", type: "record_archived", actorUserId: "usr-002", region: REGION_B, at: "2026-03-04T09:00:00Z" });
  });

  it("returns events across records, not just one", () => {
    const page = listActivity(ONLY_TEST, "newest", 1, 20);
    expect(page.totalCount).toBe(5);
    expect(new Set(page.rows.map((e) => e.recordId)).size).toBe(3);
  });

  it("also returns the seeded log alongside them", () => {
    expect(listActivity(NO_FILTERS, "newest", 1, 500).totalCount).toBeGreaterThan(5);
  });

  it("defaults to newest first, and can be reversed", () => {
    expect(listActivity(ONLY_TEST, "newest", 1, 20).rows[0]?.recordId).toBe("r3");
    expect(listActivity(ONLY_TEST, "oldest", 1, 20).rows[0]?.recordId).toBe("r1");
  });

  it("filters by a real user", () => {
    const page = listActivity({ ...ONLY_TEST, actorUserIds: ["usr-002"] }, "newest", 1, 20);
    expect(page.totalCount).toBe(2);
    expect(page.rows.every((e) => e.actorUserId === "usr-002")).toBe(true);
  });

  /* The two filter values that are not users. Without them the actor filter
   * cannot express "only what people did", which is the page's whole point. */
  it("filters to machine-generated events with the system sentinel", () => {
    const page = listActivity({ ...ONLY_TEST, actorUserIds: [SYSTEM_ACTOR_FILTER] }, "newest", 1, 20);
    expect(page.totalCount).toBe(1);
    expect(page.rows[0]?.type).toBe("ocr_completed");
    expect(page.rows[0]?.actorUserId).toBeUndefined();
  });

  it("filters to citizen submissions with the citizen sentinel", () => {
    const page = listActivity({ ...ONLY_TEST, actorUserIds: [CITIZEN_ACTOR_FILTER] }, "newest", 1, 20);
    expect(page.totalCount).toBe(1);
    expect(page.rows[0]?.recordId).toBe("r2");
  });

  it("filters by event type", () => {
    expect(listActivity({ ...ONLY_TEST, types: ["scan_created"] }, "newest", 1, 20).totalCount).toBe(2);
  });

  it("filters by region", () => {
    expect(listActivity(ONLY_A, "newest", 1, 20).totalCount).toBe(2);
  });

  it("combines dimensions as AND across, OR within", () => {
    const page = listActivity(
      { ...ONLY_TEST, actorUserIds: ["usr-001", "usr-002"], regions: [REGION_A] },
      "newest",
      1,
      20
    );
    expect(page.totalCount).toBe(1);
    expect(page.rows[0]?.actorUserId).toBe("usr-001");
  });

  it("treats a date range as inclusive of the whole end day", () => {
    const page = listActivity({ ...ONLY_TEST, dateFrom: "2026-03-02", dateTo: "2026-03-03" }, "newest", 1, 20);
    expect(page.totalCount).toBe(2);
  });

  it("excludes events outside the range", () => {
    expect(listActivity({ ...ONLY_TEST, dateFrom: "2026-03-05" }, "newest", 1, 20).totalCount).toBe(0);
  });

  it("scopes to one record when deep-linked", () => {
    expect(listActivity({ ...NO_FILTERS, recordId: "r1" }, "newest", 1, 20).totalCount).toBe(2);
  });

  it("paginates without losing or repeating a row", () => {
    const first = listActivity(ONLY_TEST, "newest", 1, 2);
    const second = listActivity(ONLY_TEST, "newest", 2, 2);
    const third = listActivity(ONLY_TEST, "newest", 3, 2);

    expect(first.totalCount).toBe(5);
    expect(first.rows).toHaveLength(2);
    expect(third.rows).toHaveLength(1);

    const ids = [...first.rows, ...second.rows, ...third.rows].map((e) => e.id);
    expect(new Set(ids).size).toBe(5);
  });

  /* The seed backfill produces events sharing a timestamp, so without a
   * tiebreaker the same event could appear on two pages. */
  it("orders deterministically when timestamps tie", () => {
    for (let i = 0; i < 6; i += 1) {
      emitActivityEvent({ recordId: "tie", type: "ocr_completed", region: REGION_A, at: "2026-04-01T09:00:00Z" });
    }
    const scoped: ActivityFilters = { ...NO_FILTERS, recordId: "tie" };
    const first = listActivity(scoped, "newest", 1, 3).rows.map((e) => e.id);
    const second = listActivity(scoped, "newest", 2, 3).rows.map((e) => e.id);
    expect(new Set([...first, ...second]).size).toBe(6);
  });

  it("keeps an empty-string region rather than dropping it", () => {
    emitActivityEvent({ recordId: "blank-region", type: "scan_created", region: "" });
    const page = listActivity({ ...NO_FILTERS, recordId: "blank-region" }, "newest", 1, 20);
    expect(page.rows[0]).toHaveProperty("region", "");
  });

  it("reports an empty page rather than throwing when nothing matches", () => {
    const page = listActivity({ ...NO_FILTERS, regions: ["Nowhere At All"] }, "newest", 1, 20);
    expect(page.rows).toEqual([]);
    expect(page.totalCount).toBe(0);
  });

  it("includes archived records, so the archive event stays reachable", () => {
    const all = listActivity(NO_FILTERS, "newest", 1, 500);
    expect(all.rows.some((e) => e.recordId === "rec-1012")).toBe(true);
  });

  it("offers only regions the log actually contains", () => {
    const regions = activityRegions();
    expect(regions).toEqual([...regions].sort());
    for (const region of regions) {
      expect(listActivity({ ...NO_FILTERS, regions: [region] }, "newest", 1, 500).totalCount)
        .toBeGreaterThan(0);
    }
  });
});
