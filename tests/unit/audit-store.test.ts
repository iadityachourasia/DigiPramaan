import { beforeEach, describe, expect, it } from "vitest";

import {
  activityForRecord,
  emitActivityEvent,
  ensureSeeded,
  projectAuditTrail,
  resetAuditStoreForTests,
} from "@/lib/server/audit-store";
import { MOCK_ACTIVE_RECORDS } from "@/lib/mock/records";
import { ACTIVITY_EVENT_TYPES, ACTIVITY_TO_AUDIT_TYPE, CITIZEN_ACTOR_ID } from "@/types";

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
