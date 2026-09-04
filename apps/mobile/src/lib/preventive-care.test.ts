import { describe, expect, it } from "vitest";
import type { PreventiveCareRecord } from "./health";
import {
  latestPreventiveCareRecord,
  mergePreventiveCareRecord,
  nextPreventiveCareCheckInOn,
  preventiveCareCompletionForToday,
  preventiveCareMonthlyStatus,
  preventiveCareMonthlyStatuses,
  preventiveCareOptions,
  preventiveCareUpsertConflict,
  preventiveCareUpsertPayload,
  toPreventiveCareRecord,
} from "./preventive-care";

function completion(
  category: PreventiveCareRecord["category"],
  completedOn: string,
  id = `${category}-${completedOn}`,
): PreventiveCareRecord {
  return {
    id,
    petId: "pet-1",
    category,
    completedOn,
    completedMonth: `${completedOn.slice(0, 7)}-01`,
    note: "",
    sourceType: "owner",
    reviewStatus: "user_reported",
    createdAt: `${completedOn}T03:00:00.000Z`,
    updatedAt: `${completedOn}T03:00:00.000Z`,
  };
}

describe("mobile preventive-care helpers", () => {
  it("offers the two owner-entered monthly categories", () => {
    expect(preventiveCareOptions).toEqual([
      { id: "heartworm", label: "심장사상충" },
      { id: "internal_external_parasite", label: "내·외부 기생충" },
    ]);
  });

  it("stamps a one-tap completion with the Korean calendar date", () => {
    expect(
      preventiveCareCompletionForToday(
        "heartworm",
        new Date("2026-09-02T15:30:00.000Z"),
      ),
    ).toEqual({
      category: "heartworm",
      completedOn: "2026-09-03",
      note: "",
    });
  });

  it("uses the generated month as the database upsert conflict target", () => {
    const payload = preventiveCareUpsertPayload(
      "user-1",
      "pet-1",
      { category: "heartworm", completedOn: "2026-09-03", note: "  완료  " },
      new Date("2026-09-03T03:00:00.000Z"),
    );

    expect(preventiveCareUpsertConflict).toBe(
      "pet_id,category,completed_month",
    );
    expect(payload).toEqual({
      user_id: "user-1",
      pet_id: "pet-1",
      category: "heartworm",
      completed_on: "2026-09-03",
      note: "완료",
      source_type: "owner",
      review_status: "user_reported",
      updated_at: "2026-09-03T03:00:00.000Z",
    });
    expect(payload).not.toHaveProperty("completed_month");
  });

  it("shows a factual monthly check-in when this month has no completion", () => {
    const status = preventiveCareMonthlyStatus(
      [completion("heartworm", "2026-08-20")],
      "heartworm",
      new Date("2026-09-03T03:00:00.000Z"),
    );

    expect(status.state).toBe("check-in");
    expect(status.latestCompletedOn).toBe("2026-08-20");
    expect(status.nextCheckInOn).toBe("2026-09-03");
    expect(status.reminder.title).toBe("심장사상충, 이번 달 했나요?");
    expect(status.reminder.actionLabel).toBe("오늘 날짜로 기록");
    expect(status.reminder.description).not.toMatch(/진단|처방|치료|약명|용량/u);
  });

  it("marks only the matching category complete and checks again next month", () => {
    const records = [
      completion("heartworm", "2026-09-02"),
      completion("internal_external_parasite", "2026-08-25"),
    ];
    const statuses = preventiveCareMonthlyStatuses(
      records,
      new Date("2026-09-03T03:00:00.000Z"),
    );

    expect(statuses.map((status) => status.state)).toEqual([
      "completed",
      "check-in",
    ]);
    expect(statuses[0]?.completedOn).toBe("2026-09-02");
    expect(statuses[0]?.nextCheckInOn).toBe("2026-10-01");
    expect(statuses[0]?.reminder.description).toContain("보호자가 했다고 기록");
  });

  it("moves a December completion check-in into the next calendar year", () => {
    expect(
      nextPreventiveCareCheckInOn(
        [completion("heartworm", "2026-12-31")],
        "heartworm",
        new Date("2026-12-31T03:00:00.000Z"),
      ),
    ).toBe("2027-01-01");
  });

  it("keeps the latest valid completion for a category", () => {
    expect(
      latestPreventiveCareRecord(
        [
          completion("heartworm", "2026-07-10"),
          completion("heartworm", "2026-09-01"),
          completion("internal_external_parasite", "2026-09-02"),
        ],
        "heartworm",
      )?.completedOn,
    ).toBe("2026-09-01");
  });

  it("replaces the same category and month locally without dropping other stamps", () => {
    const merged = mergePreventiveCareRecord(
      [
        completion("heartworm", "2026-09-01", "old-september"),
        completion("heartworm", "2026-08-10"),
        completion("internal_external_parasite", "2026-09-01"),
      ],
      completion("heartworm", "2026-09-03", "saved-september"),
    );

    expect(merged).toHaveLength(3);
    expect(
      merged.filter(
        (record) =>
          record.category === "heartworm" &&
          record.completedOn.startsWith("2026-09"),
      ),
    ).toEqual([
      expect.objectContaining({ id: "saved-september", completedOn: "2026-09-03" }),
    ]);
  });

  it("preserves owner source and review state when mapping database rows", () => {
    expect(
      toPreventiveCareRecord({
        id: "care-1",
        pet_id: "pet-1",
        category: "internal_external_parasite",
        completed_on: "2026-09-03",
        completed_month: "2026-09-01",
        note: null,
        source_type: "owner",
        review_status: "user_reported",
        created_at: "2026-09-03T03:00:00.000Z",
        updated_at: "2026-09-03T03:00:00.000Z",
      }),
    ).toEqual(
      expect.objectContaining({
        category: "internal_external_parasite",
        completedMonth: "2026-09-01",
        note: "",
        sourceType: "owner",
        reviewStatus: "user_reported",
      }),
    );
  });
});
