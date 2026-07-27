import { afterEach, describe, expect, it, vi } from "vitest";

const billingMocks = vi.hoisted(() => ({
  recordAiCreditPurchase: vi.fn(),
  recordBillingEvent: vi.fn(),
  refundAiCreditPurchase: vi.fn(),
  reverseAiCreditRefund: vi.fn(),
}));

vi.mock("./supabase-admin", () => billingMocks);

import {
  processRevenueCatWebhook,
  revenueCatProductIds,
  syncRevenueCatPurchases,
  verifyRevenueCatWebhookAuthorization,
} from "./revenuecat";

const userId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete process.env.REVENUECAT_AI_SUMMARY_PRODUCT_ID;
  delete process.env.REVENUECAT_AI_SUMMARY_PRODUCT_IDS;
  delete process.env.REVENUECAT_SECRET_API_KEY;
  delete process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN;
});

describe("RevenueCat billing verification", () => {
  it("keeps purchases behind an explicit product allowlist", () => {
    process.env.REVENUECAT_AI_SUMMARY_PRODUCT_ID = "petflow_ai_summary_1";
    process.env.REVENUECAT_AI_SUMMARY_PRODUCT_IDS =
      "petflow_ai_summary_2, petflow_ai_summary_3";

    expect([...revenueCatProductIds()]).toEqual([
      "petflow_ai_summary_1",
      "petflow_ai_summary_2",
      "petflow_ai_summary_3",
    ]);
  });

  it("accepts only the configured webhook authorization", () => {
    process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN = "secret-token";

    expect(verifyRevenueCatWebhookAuthorization("secret-token")).toBe(true);
    expect(
      verifyRevenueCatWebhookAuthorization("Bearer secret-token"),
    ).toBe(true);
    expect(verifyRevenueCatWebhookAuthorization("wrong-token")).toBe(false);
    expect(verifyRevenueCatWebhookAuthorization(null)).toBe(false);
  });

  it("credits an allowed non-renewing purchase once through the ledger RPC", async () => {
    billingMocks.recordAiCreditPurchase.mockResolvedValue(
      "22222222-2222-4222-8222-222222222222",
    );
    billingMocks.recordBillingEvent.mockResolvedValue(true);

    const result = await processRevenueCatWebhook({
      id: "event-purchase",
      type: "NON_RENEWING_PURCHASE",
      app_user_id: userId,
      product_id: "petflow_ai_summary_1",
      store: "APP_STORE",
      environment: "SANDBOX",
      transaction_id: "transaction-1",
      purchased_at_ms: 1_700_000_000_000,
      price: 1.49,
      price_in_purchased_currency: 1900,
      currency: "KRW",
      country_code: "KR",
      quantity: 2,
      tax_percentage: 0.1,
      commission_percentage: 0.15,
    });

    expect(result).toEqual({ processed: true, status: "credited" });
    expect(billingMocks.recordAiCreditPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        transactionId: "transaction-1",
        productId: "petflow_ai_summary_1",
        store: "app_store",
        environment: "sandbox",
        priceUsd: 1.49,
        priceAmount: 1900,
        currency: "KRW",
        countryCode: "KR",
        credits: 2,
        quantity: 2,
        taxPercentage: 0.1,
        commissionPercentage: 0.15,
      }),
    );
    expect(billingMocks.recordBillingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-purchase",
        status: "processed",
      }),
    );
  });

  it("ignores purchases for unrelated products", async () => {
    billingMocks.recordBillingEvent.mockResolvedValue(true);

    const result = await processRevenueCatWebhook({
      id: "event-unrelated",
      type: "NON_RENEWING_PURCHASE",
      app_user_id: userId,
      product_id: "another_product",
      transaction_id: "transaction-2",
    });

    expect(result).toEqual({ processed: true, status: "ignored" });
    expect(billingMocks.recordAiCreditPurchase).not.toHaveBeenCalled();
    expect(billingMocks.recordBillingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "unrelated_product" }),
    );
  });

  it("revokes unused credit on a refund and restores it when reversed", async () => {
    billingMocks.refundAiCreditPurchase.mockResolvedValue(true);
    billingMocks.reverseAiCreditRefund.mockResolvedValue(true);
    billingMocks.recordBillingEvent.mockResolvedValue(true);

    const refunded = await processRevenueCatWebhook({
      id: "event-refund",
      type: "CANCELLATION",
      app_user_id: userId,
      product_id: "petflow_ai_summary_1",
      transaction_id: "transaction-3",
      event_timestamp_ms: 1_700_000_000_000,
    });
    const reversed = await processRevenueCatWebhook({
      id: "event-reversal",
      type: "REFUND_REVERSED",
      app_user_id: userId,
      product_id: "petflow_ai_summary_1",
      transaction_id: "transaction-3",
      event_timestamp_ms: 1_700_000_010_000,
    });

    expect(refunded).toEqual({ processed: true, status: "refunded" });
    expect(reversed).toEqual({
      processed: true,
      status: "refund_reversed",
    });
    expect(billingMocks.refundAiCreditPurchase).toHaveBeenCalledWith(
      "transaction-3",
      "event-refund",
      expect.any(String),
    );
    expect(billingMocks.reverseAiCreditRefund).toHaveBeenCalledWith(
      "transaction-3",
      "event-reversal",
      expect.any(String),
    );
  });

  it("requests a retry when a refund arrives before its purchase", async () => {
    billingMocks.refundAiCreditPurchase.mockResolvedValue(false);
    billingMocks.recordBillingEvent.mockResolvedValue(true);

    const result = await processRevenueCatWebhook({
      id: "event-early-refund",
      type: "CANCELLATION",
      app_user_id: userId,
      product_id: "petflow_ai_summary_1",
      transaction_id: "transaction-pending",
    });

    expect(result).toEqual({ processed: false, status: "failed" });
    expect(billingMocks.recordBillingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "purchase_not_found",
      }),
    );
  });

  it("requests a retry when a verified purchase cannot be recorded", async () => {
    billingMocks.recordAiCreditPurchase.mockResolvedValue(null);
    billingMocks.recordBillingEvent.mockResolvedValue(true);

    const result = await processRevenueCatWebhook({
      id: "event-db-failure",
      type: "NON_RENEWING_PURCHASE",
      app_user_id: userId,
      product_id: "petflow_ai_summary_1",
      store: "PLAY_STORE",
      environment: "PRODUCTION",
      transaction_id: "transaction-db-failure",
      purchased_at_ms: 1_700_000_000_000,
    });

    expect(result).toEqual({ processed: false, status: "failed" });
  });

  it("syncs only valid allowlisted customer transactions", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "secret-api-key";
    billingMocks.recordAiCreditPurchase.mockResolvedValue(
      "33333333-3333-4333-8333-333333333333",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          subscriber: {
            non_subscriptions: {
              petflow_ai_summary_1: [
                {
                  id: "valid-transaction",
                  is_sandbox: false,
                  purchase_date: "2026-07-23T06:00:00.000Z",
                  store: "play_store",
                },
                {
                  id: "",
                  purchase_date: "invalid",
                  store: "play_store",
                },
              ],
              unrelated_product: [
                {
                  id: "ignored-transaction",
                  purchase_date: "2026-07-23T06:00:00.000Z",
                  store: "app_store",
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    await expect(syncRevenueCatPurchases(userId)).resolves.toEqual({
      configured: true,
      purchasesFound: 1,
      creditsRecorded: 1,
    });
    expect(billingMocks.recordAiCreditPurchase).toHaveBeenCalledTimes(1);
  });
});
