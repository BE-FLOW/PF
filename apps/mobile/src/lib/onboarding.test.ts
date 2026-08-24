import { describe, expect, it } from "vitest";
import { buildFirstUseGuide } from "./onboarding";

describe("first-use guide", () => {
  it("starts with pet registration when the account has no pet", () => {
    const guide = buildFirstUseGuide({ petCount: 0, recordCount: 0 });

    expect(guide.action).toBe("register");
    expect(guide.actionLabel).toBe("아이 등록하고 시작");
    expect(guide.result).toContain("병원 전달본은 무료");
    expect(guide.result).not.toContain("첫 전달본");
  });

  it("starts a short record when a pet has no history", () => {
    const guide = buildFirstUseGuide({
      petCount: 1,
      petName: "보리",
      recordCount: 0,
    });

    expect(guide.action).toBe("record");
    expect(guide.title).toContain("보리");
    expect(guide.result).toContain("모든 병원 전달본은 무료");
    expect(guide.result).not.toContain("첫 전달본");
  });

  it("uses existing records instead of asking for repeated input", () => {
    const guide = buildFirstUseGuide({
      petCount: 1,
      petName: "보리",
      recordCount: 4,
    });

    expect(guide.action).toBe("report");
    expect(guide.title).toContain("4개 기록");
    expect(guide.result).toContain("병원 전달본은 무료");
  });
});
