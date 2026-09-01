import { describe, expect, it } from "vitest";
import type { VaccinationRecord } from "./health";
import {
  vaccinationDraftForName,
  vaccinationDraftFromRecords,
  vaccinationDueAt,
  vaccinationIntervalFromDates,
  vaccinationOptionForName,
  vaccinationReminder,
} from "./vaccinations";

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
    expect(reminder?.label).toBe("일정 확인");
  });

  it("keeps distant schedules visually quiet", () => {
    const reminder = vaccinationReminder(
      [vaccination("2026-09-01")],
      new Date("2026-07-14T12:00:00"),
    );

    expect(reminder?.tone).toBe("none");
    expect(reminder?.label).toBe("다음 일정");
    expect(reminder?.title).toContain("2026.09.01");
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

  it("matches the Korean dog vaccination aliases without presenting them as requirements", () => {
    expect(vaccinationOptionForName("코로나장염백신")?.id).toBe("coronavirus");
    expect(vaccinationOptionForName("신종인플루엔자")?.id).toBe("influenza");
    expect(vaccinationOptionForName("사용자 입력 백신")).toBeNull();
  });

  it("calculates only the interval selected from hospital guidance", () => {
    expect(vaccinationDueAt("2026-04-11", "1year")).toBe("2027-04-11");
    expect(vaccinationDueAt("2024-02-29", "1year")).toBe("2025-02-28");
    expect(vaccinationDueAt("2026-01-31", "6months")).toBe("2026-07-31");
    expect(vaccinationDueAt("2026-07-01", "4weeks")).toBe("2026-07-29");
    expect(vaccinationDueAt("invalid", "1year")).toBe("");
  });

  it("reuses an existing exact interval and keeps other vaccine rows separate", () => {
    expect(vaccinationIntervalFromDates("2026-04-11", "2027-04-11")).toBe("1year");
    expect(vaccinationIntervalFromDates("2026-04-11", "2026-05-01")).toBeNull();

    const rabies = {
      ...vaccination("2027-04-11"),
      id: "rabies-1",
      name: "광견병백신",
      administeredAt: "2026-04-11",
    };
    const core = { ...vaccination("2029-07-01"), id: "core-1", name: "종합백신" };

    expect(vaccinationDraftForName([core, rabies], "광견병").id).toBe("rabies-1");
    expect(vaccinationDraftForName([core, rabies], "켄넬코프").id).toBeUndefined();
  });
});
