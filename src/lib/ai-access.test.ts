import { describe, expect, it } from "vitest";
import {
  buildFreeAiAccessStatus,
  buildAiCreditAccessStatus,
  defaultFreeAiDailyLimit,
  defaultAiSummaryProductId,
  freeAiServerConfiguration,
  resolveFreeAiDailyLimit,
  resolveAiSummaryProductId,
} from "./ai-access";

describe("AI summary credits", () => {
  it("enables AI summaries while at least one credit remains", () => {
    expect(buildAiCreditAccessStatus(2, 1, 1, 3)).toEqual({
      enabled: true,
      reason: "active",
      availableCredits: 2,
      complimentaryCredits: 1,
      purchasedCredits: 1,
      usedTotal: 3,
      billingConfigured: false,
      purchaseAvailable: false,
      productId: defaultAiSummaryProductId,
      freeRelease: false,
      dailyLimit: 0,
      attemptsToday: 0,
      dailyAttemptLimit: 0,
      resetsAt: null,
    });
  });

  it("asks for a one-time purchase after all credits are used", () => {
    expect(
      buildAiCreditAccessStatus(0, 0, 0, 8, {
        billingConfigured: true,
        productId: "custom_product",
      }),
    ).toEqual({
      enabled: false,
      reason: "no_credits",
      availableCredits: 0,
      complimentaryCredits: 0,
      purchasedCredits: 0,
      usedTotal: 8,
      billingConfigured: true,
      purchaseAvailable: true,
      productId: "custom_product",
      freeRelease: false,
      dailyLimit: 0,
      attemptsToday: 0,
      dailyAttemptLimit: 0,
      resetsAt: null,
    });
  });

  it("uses the shared product identifier when none is configured", () => {
    expect(resolveAiSummaryProductId(" ")).toBe(defaultAiSummaryProductId);
  });
});

describe("free AI fair use", () => {
  it("uses a safe default for missing or invalid server configuration", () => {
    expect(resolveFreeAiDailyLimit()).toBe(defaultFreeAiDailyLimit);
    expect(resolveFreeAiDailyLimit("0")).toBe(defaultFreeAiDailyLimit);
    expect(resolveFreeAiDailyLimit("101")).toBe(defaultFreeAiDailyLimit);
    expect(resolveFreeAiDailyLimit("3.5")).toBe(defaultFreeAiDailyLimit);
  });

  it("accepts an integer daily limit in the server safety range", () => {
    expect(resolveFreeAiDailyLimit("7")).toBe(7);
  });

  it("exposes remaining daily use without purchase state", () => {
    expect(
      buildFreeAiAccessStatus(1, 3, "2026-08-18T15:00:00.000Z"),
    ).toEqual({
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
    });
  });

  it("blocks only until the next KST reset after the daily limit", () => {
    expect(buildFreeAiAccessStatus(3, 3, "reset")).toMatchObject({
      enabled: false,
      reason: "daily_limit",
      availableCredits: 0,
      purchaseAvailable: false,
      resetsAt: "reset",
    });
  });

  it("stops repeated failed model calls at a separate attempt budget", () => {
    expect(buildFreeAiAccessStatus(0, 3, "reset", 9, 9)).toMatchObject({
      enabled: false,
      reason: "attempt_limit",
      availableCredits: 3,
      attemptsToday: 9,
      dailyAttemptLimit: 9,
    });
  });

  it("publishes a free-release server configuration", () => {
    const previous = process.env.FREE_AI_DAILY_LIMIT;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.FREE_AI_DAILY_LIMIT = "5";
    process.env.OPENAI_API_KEY = "configured-for-test";
    expect(freeAiServerConfiguration()).toEqual({
      freeRelease: true,
      generationConfigured: true,
      dailyLimit: 5,
      dailyAttemptLimit: 15,
    });
    if (previous === undefined) delete process.env.FREE_AI_DAILY_LIMIT;
    else process.env.FREE_AI_DAILY_LIMIT = previous;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
  });

  it("does not report AI generation ready without the server key", () => {
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(freeAiServerConfiguration().generationConfigured).toBe(false);
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
  });
});
