import { describe, expect, it } from "vitest";
import {
  isDateInputOnOrBefore,
  isValidDateInput,
  normalizeDateInput,
} from "./date-input";

describe("mobile date input helpers", () => {
  it("adds date separators progressively as digits are entered", () => {
    expect(normalizeDateInput("")).toBe("");
    expect(normalizeDateInput("2026")).toBe("2026");
    expect(normalizeDateInput("20260")).toBe("2026-0");
    expect(normalizeDateInput("202609")).toBe("2026-09");
    expect(normalizeDateInput("2026090")).toBe("2026-09-0");
    expect(normalizeDateInput("20260903")).toBe("2026-09-03");
  });

  it("keeps formatted input stable and limits the value to one date", () => {
    expect(normalizeDateInput("2026-09-03")).toBe("2026-09-03");
    expect(normalizeDateInput("202609031234")).toBe("2026-09-03");
  });

  it("accepts complete compact and formatted calendar dates", () => {
    expect(isValidDateInput("20260903")).toBe(true);
    expect(isValidDateInput("2026-09-03")).toBe(true);
    expect(isValidDateInput("2024-02-29")).toBe(true);
  });

  it("rejects incomplete, malformed, and impossible calendar dates", () => {
    expect(isValidDateInput("202609")).toBe(false);
    expect(isValidDateInput("2026/09/03")).toBe(false);
    expect(isValidDateInput("2023-02-29")).toBe(false);
    expect(isValidDateInput("2026-13-01")).toBe(false);
    expect(isValidDateInput("2026-04-31")).toBe(false);
    expect(isValidDateInput("0000-01-01")).toBe(false);
  });
});

describe("isDateInputOnOrBefore", () => {
  it("allows today and past dates but rejects future dates", () => {
    const latest = new Date(2026, 8, 3, 12, 0, 0);
    expect(isDateInputOnOrBefore("20260903", latest)).toBe(true);
    expect(isDateInputOnOrBefore("2026-09-02", latest)).toBe(true);
    expect(isDateInputOnOrBefore("2026-09-04", latest)).toBe(false);
  });
});
