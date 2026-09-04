import { describe, expect, it } from "vitest";
import type { VaccinationRecord } from "./health";
import {
  vaccinationDraftForNewEntry,
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

  it("ignores an older overdue schedule after a newer dose of the same vaccine", () => {
    const older = {
      ...vaccination("2026-04-11"),
      id: "rabies-old",
      name: "광견병",
      administeredAt: "2025-04-11",
      createdAt: "2025-04-11T00:00:00.000Z",
      updatedAt: "2025-04-11T00:00:00.000Z",
    };
    const newer = {
      ...vaccination("2027-04-11"),
      id: "rabies-new",
      name: "광견병백신",
      administeredAt: "2026-04-11",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    };

    const reminder = vaccinationReminder(
      [older, newer],
      new Date("2026-09-03T12:00:00"),
    );

    expect(reminder?.title).toContain("2027.04.11");
    expect(reminder?.label).toBe("다음 일정");
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

  it("keeps interval detection separate and starts every selected vaccine as a new row", () => {
    expect(vaccinationIntervalFromDates("2026-04-11", "2027-04-11")).toBe("1year");
    expect(vaccinationIntervalFromDates("2026-04-11", "2026-05-01")).toBeNull();

    expect(vaccinationDraftForNewEntry("코로나 장염")).toEqual({
      name: "코로나 장염",
      administeredAt: "",
      dueAt: "",
      note: "",
    });
  });
});
