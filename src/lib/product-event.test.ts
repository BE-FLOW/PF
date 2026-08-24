import { describe, expect, it } from "vitest";
import {
  freeReleaseProductEventId,
  parseProductQualityEvent,
} from "./product-event";

const validEvent = {
  eventId: "4d29f591-c88d-4df2-815a-453aabf49ca5",
  eventName: "ai_summary_shared",
  context: "report",
  platform: "ios",
  appVersion: "1.0",
  appBuild: "28",
};

describe("parseProductQualityEvent", () => {
  it("uses a neutral free-release identifier instead of a store product id", () => {
    expect(freeReleaseProductEventId).toBe("petflow_free_release");
  });

  it("accepts only the two minimal handoff share signals", () => {
    expect(parseProductQualityEvent(validEvent)).toEqual(validEvent);
    expect(
      parseProductQualityEvent({
        ...validEvent,
        eventName: "factual_summary_shared",
      }),
    ).toEqual({ ...validEvent, eventName: "factual_summary_shared" });
  });

  it("rejects billing events and arbitrary contexts", () => {
    expect(
      parseProductQualityEvent({ ...validEvent, eventName: "purchase_started" }),
    ).toBeNull();
    expect(
      parseProductQualityEvent({ ...validEvent, context: "account" }),
    ).toBeNull();
  });
});
