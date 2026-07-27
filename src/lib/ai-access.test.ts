import { describe, expect, it } from "vitest";
import {
  buildAiCreditAccessStatus,
  defaultAiSummaryProductId,
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
    });
  });

  it("uses the shared product identifier when none is configured", () => {
    expect(resolveAiSummaryProductId(" ")).toBe(defaultAiSummaryProductId);
  });
});
