import { describe, expect, it } from "vitest";
import {
  aiAccessCopy,
  aiDraftDailyLabel,
  aiResetCopy,
  isDailyAiLimitReached,
} from "./ai-access";
import type { AiAccessStatus } from "./health";

function access(overrides: Partial<AiAccessStatus> = {}): AiAccessStatus {
  return {
    enabled: true,
    reason: "active",
    availableCredits: 2,
    complimentaryCredits: 0,
    purchasedCredits: 0,
    usedTotal: 1,
    billingConfigured: false,
    purchaseAvailable: false,
    productId: "",
    freeRelease: true,
    dailyLimit: 3,
    attemptsToday: 1,
    dailyAttemptLimit: 9,
    resetsAt: "2026-08-18T15:00:00.000Z",
    ...overrides,
  };
}

describe("free AI daily limit copy", () => {
  it("shows today's remaining uses, daily limit, and Korea reset time", () => {
    const status = access();

    expect(aiAccessCopy(status)).toContain("하루 3회");
    expect(aiAccessCopy(status)).toContain("오늘 2회 남았어요");
    expect(aiDraftDailyLabel(status)).toBe("오늘 2/3회");
    expect(aiResetCopy(status)).toBe("8월 19일 오전 12:00에 한도가 초기화돼요.");
  });

  it("explains the reached daily limit without paid language", () => {
    const status = access({
      enabled: false,
      reason: "daily_limit",
      availableCredits: 0,
    });
    const copy = aiAccessCopy(status);

    expect(isDailyAiLimitReached(status)).toBe(true);
    expect(copy).toContain("오늘의 무료 AI 정리 3회를 모두 사용했어요");
    expect(copy).toContain("기본 사실 전달본은 계속 공유할 수 있어요");
    expect(copy).not.toMatch(/이용권|구매|결제|복원/);
  });

  it("accepts the legacy no_credits reason during server rollout", () => {
    expect(
      isDailyAiLimitReached(
        access({ enabled: false, reason: "no_credits", availableCredits: 0 }),
      ),
    ).toBe(true);
  });

  it("explains the repeated-attempt safety limit without paid language", () => {
    const copy = aiAccessCopy(
      access({ enabled: false, reason: "attempt_limit", attemptsToday: 9 }),
    );
    expect(copy).toContain("반복 요청 안전 한도");
    expect(copy).not.toMatch(/이용권|구매|결제|복원/);
  });
});
