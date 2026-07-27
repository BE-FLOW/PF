import { afterEach, describe, expect, it, vi } from "vitest";
import {
  syncBillingAccess,
  syncBillingAfterPurchase,
} from "./monetization";

const noCredit = {
  access: {
    enabled: false,
    reason: "no_credits" as const,
    availableCredits: 0,
    complimentaryCredits: 0,
    purchasedCredits: 0,
    usedTotal: 1,
    billingConfigured: true,
    purchaseAvailable: true,
    productId: "petflow_ai_summary_1",
  },
  error: null,
};

const credited = {
  access: {
    ...noCredit.access,
    enabled: true,
    reason: "active" as const,
    availableCredits: 1,
    purchasedCredits: 1,
  },
  error: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncBillingAccess", () => {
  it("returns a short recoverable error when the server cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(
      syncBillingAccess("https://example.com", "access-token"),
    ).resolves.toEqual({
      access: null,
      error: "구매 내역을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
    });
  });
});

describe("syncBillingAfterPurchase", () => {
  it("stops as soon as the purchased credit appears", async () => {
    const sync = vi
      .fn()
      .mockResolvedValueOnce(noCredit)
      .mockResolvedValueOnce(credited);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await syncBillingAfterPurchase(sync, 1, sleep);

    expect(result.synced).toBe(true);
    expect(result.access?.availableCredits).toBe(1);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("returns the latest status when store propagation is delayed", async () => {
    const sync = vi.fn().mockResolvedValue(noCredit);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await syncBillingAfterPurchase(sync, 1, sleep);

    expect(result.synced).toBe(false);
    expect(result.access?.availableCredits).toBe(0);
    expect(sync).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("waits for the balance to increase when the account already has credit", async () => {
    const existingCredit = {
      ...credited,
      access: {
        ...credited.access,
        availableCredits: 1,
      },
    };
    const increasedCredit = {
      ...credited,
      access: {
        ...credited.access,
        availableCredits: 2,
        purchasedCredits: 2,
      },
    };
    const sync = vi
      .fn()
      .mockResolvedValueOnce(existingCredit)
      .mockResolvedValueOnce(increasedCredit);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await syncBillingAfterPurchase(sync, 2, sleep);

    expect(result.synced).toBe(true);
    expect(result.access?.availableCredits).toBe(2);
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
