import { describe, expect, it } from "vitest";
import {
  buildRecordCalendar,
  isRecordDateInRange,
  monthKeyFromDate,
  normalizeRecordDateRange,
  recordDateKeyToIso,
  shiftRecordMonth,
  toRecordDateKey,
} from "./record-calendar";

describe("record calendar", () => {
  it("uses the Korean calendar day for stored timestamps", () => {
    expect(toRecordDateKey("2026-07-20T16:30:00.000Z")).toBe("2026-07-21");
    expect(monthKeyFromDate("2026-07-20T16:30:00.000Z")).toBe("2026-07");
  });

  it("builds a stable six-week calendar and normalizes ranges", () => {
    const days = buildRecordCalendar("2026-07");
    expect(days).toHaveLength(42);
    expect(days[0].dateKey).toBe("2026-06-28");
    expect(days[41].dateKey).toBe("2026-08-08");
    expect(shiftRecordMonth("2026-12", 1)).toBe("2027-01");
    expect(normalizeRecordDateRange("2026-07-21", "2026-07-03")).toEqual({
      start: "2026-07-03",
      end: "2026-07-21",
    });
    expect(isRecordDateInRange("2026-07-12", "2026-07-03", "2026-07-21")).toBe(true);
  });

  it("turns a selected day into an observation timestamp", () => {
    const now = new Date("2026-07-21T03:34:56.000Z");
    expect(recordDateKeyToIso("2026-07-20", now)).toBe(
      "2026-07-20T03:00:00.000Z",
    );
    expect(recordDateKeyToIso("2026-07-22", now)).toBeNull();
  });
});
