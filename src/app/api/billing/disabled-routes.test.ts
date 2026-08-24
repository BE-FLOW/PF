import { describe, expect, it } from "vitest";
import { POST as recordBillingEvent } from "./events/route";
import { POST as handleRevenueCatWebhook } from "./revenuecat/webhook/route";
import { POST as syncBilling } from "./sync/route";

describe("free public release billing routes", () => {
  it.each([
    ["event", recordBillingEvent],
    ["RevenueCat webhook", handleRevenueCatWebhook],
    ["purchase sync", syncBilling],
  ])("returns gone before processing %s requests", async (_label, handler) => {
    const response = await handler();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });
});
