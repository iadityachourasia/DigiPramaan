import { describe, expect, it } from "vitest";

import { buildNotificationsQuery } from "@/lib/api/notifications";
import { notificationIcon, resolveNotificationLink } from "@/lib/utils/notifications";
import type { NotificationEntry } from "@/types";

function entry(overrides: Partial<NotificationEntry>): NotificationEntry {
  return {
    id: "n1",
    type: "account_created",
    createdAt: "2026-09-25T00:00:00Z",
    ...overrides,
  };
}

describe("resolveNotificationLink", () => {
  it("links to the record when recordId is present, regardless of type", () => {
    const link = resolveNotificationLink(
      entry({ type: "record_flagged_needs_review", recordId: "rec-1" })
    );
    expect(link).toBe("/records/rec-1");
  });

  it("links to the case when the entity is a ViolationCase with no record", () => {
    const link = resolveNotificationLink(
      entry({ type: "case_status_changed", entityType: "ViolationCase", entityId: "case-1" })
    );
    expect(link).toBe("/cases/case-1");
  });

  it("record wins over entity when both are present", () => {
    const link = resolveNotificationLink(
      entry({
        type: "case_status_changed",
        recordId: "rec-1",
        entityType: "ViolationCase",
        entityId: "case-1",
      })
    );
    expect(link).toBe("/records/rec-1");
  });

  it("account_created links to the profile page", () => {
    expect(resolveNotificationLink(entry({ type: "account_created" }))).toBe("/profile");
  });

  it("rule_thresholds_changed links to the admin console", () => {
    expect(resolveNotificationLink(entry({ type: "rule_thresholds_changed" }))).toBe("/admin");
  });
});

describe("notificationIcon", () => {
  it("returns a distinct icon per type", () => {
    const icons = new Set([
      notificationIcon("case_reassigned_to_you"),
      notificationIcon("record_flagged_needs_review"),
      notificationIcon("record_needs_review_cleared"),
      notificationIcon("case_status_changed"),
      notificationIcon("account_created"),
      notificationIcon("rule_thresholds_changed"),
      notificationIcon("record_flagged_for_enforcement"),
    ]);
    expect(icons.size).toBe(7);
  });
});

describe("buildNotificationsQuery", () => {
  it("omits the read param entirely when unset", () => {
    const query = buildNotificationsQuery({ read: undefined, types: [] }, 1, 20);
    expect(query).not.toContain("read=");
  });

  it("sets read=true/false explicitly when given", () => {
    expect(buildNotificationsQuery({ read: false, types: [] }, 1, 20)).toContain("read=false");
    expect(buildNotificationsQuery({ read: true, types: [] }, 1, 20)).toContain("read=true");
  });

  it("repeats the type key for each selected type", () => {
    const query = buildNotificationsQuery(
      { read: undefined, types: ["case_reassigned_to_you", "account_created"] },
      1,
      20
    );
    const params = new URLSearchParams(query);
    expect(params.getAll("type")).toEqual(["case_reassigned_to_you", "account_created"]);
  });

  it("always includes page and pageSize", () => {
    const query = buildNotificationsQuery({ read: undefined, types: [] }, 2, 10);
    const params = new URLSearchParams(query);
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("10");
  });
});
