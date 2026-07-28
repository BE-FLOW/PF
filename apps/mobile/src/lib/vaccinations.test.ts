import { describe, expect, it } from "vitest";
import type { VaccinationRecord } from "./health";
import { vaccinationDraftFromRecords, vaccinationReminder } from "./vaccinations";

function vaccination(
  dueAt: string | null,
  status: VaccinationRecord["status"] = "scheduled",
): VaccinationRecord {
  return {
    id: `vaccination-${dueAt ?? status}`,
    petId: "pet-1",
    name: "종합백신",
    administeredAt: status === "done" ? "2026-07-01" : null,
    dueAt,
    status,
    note: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

describe("mobile vaccination helpers", () => {
  it("keeps the latest completed vaccination visible", () => {
    const reminder = vaccinationReminder([vaccination(null, "done")]);

    expect(reminder?.tone).toBe("none");
    expect(reminder?.label).toBe("접종 기록 있음");
  });

  it("keeps distant schedules visually quiet", () => {
    const reminder = vaccinationReminder(
      [vaccination("2026-09-01")],
      new Date("2026-07-14T12:00:00"),
    );

    expect(reminder?.tone).toBe("none");
  });

  it("marks a scheduled vaccination due within a week as due", () => {
    const reminder = vaccinationReminder(
      [vaccination("2026-07-20")],
      new Date("2026-07-14T12:00:00"),
    );

    expect(reminder?.tone).toBe("due");
    expect(reminder?.label).toBe("D-6");
    expect(reminder?.title).toContain("가까워요");
  });

  it("uses the closest scheduled vaccination for edit drafts", () => {
    const draft = vaccinationDraftFromRecords([
      vaccination("2026-09-01"),
      vaccination("2026-07-20"),
    ]);

    expect(draft.dueAt).toBe("2026-07-20");
  });
});
