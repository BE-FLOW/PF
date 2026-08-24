import { afterEach, describe, expect, it, vi } from "vitest";
import { recordMobileProductEvent } from "./product-events";

afterEach(() => {
  vi.restoreAllMocks();
});

const event = {
  eventId: "event-1",
  eventName: "ai_summary_shared" as const,
  context: "report" as const,
  platform: "ios" as const,
  appVersion: "1.0",
  appBuild: "29",
};

describe("recordMobileProductEvent", () => {
  it("posts the authenticated free-product event", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      recordMobileProductEvent({
        accessToken: "access-token",
        apiBaseUrl: "https://example.com",
        event,
      }),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      "https://example.com/api/product-events",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }),
    );
  });

  it("returns false instead of interrupting the share flow", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(
      recordMobileProductEvent({
        accessToken: "access-token",
        apiBaseUrl: "https://example.com",
        event,
      }),
    ).resolves.toBe(false);
  });

  it("accepts the basic factual handoff share event", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await expect(
      recordMobileProductEvent({
        accessToken: "access-token",
        apiBaseUrl: "https://example.com",
        event: { ...event, eventName: "factual_summary_shared" },
      }),
    ).resolves.toBe(true);
  });
});
