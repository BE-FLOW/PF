import { describe, expect, it } from "vitest";
import { formatKoreanMobile, normalizeKoreanMobile } from "./phone";

describe("Korean mobile phone helpers", () => {
  it("normalizes a valid 010 mobile number", () => {
    expect(normalizeKoreanMobile("010-1234-5678")).toBe("01012345678");
  });

  it("rejects incomplete and non-mobile numbers", () => {
    expect(normalizeKoreanMobile("010-1234")).toBeNull();
    expect(normalizeKoreanMobile("02-1234-5678")).toBeNull();
  });

  it("formats input without accepting extra digits", () => {
    expect(formatKoreanMobile("0101234567899")).toBe("010-1234-5678");
  });
});
