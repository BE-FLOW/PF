import { describe, expect, it } from "vitest";
import { parseMonetizationEvent } from "./monetization";

const validEvent = {
  eventId: "4d29f591-c88d-4df2-815a-453aabf49ca5",
  eventName: "paywall_viewed",
  context: "report",
  platform: "ios",
  appVersion: "1.0",
  appBuild: "23",
};

describe("parseMonetizationEvent", () => {
  it("accepts the constrained first-party event payload", () => {
    expect(parseMonetizationEvent(validEvent)).toEqual(validEvent);
  });

  it("rejects arbitrary event names and metadata", () => {
    expect(
      parseMonetizationEvent({
        ...validEvent,
        eventName: "record_text_captured",
      }),
    ).toBeNull();
    expect(
      parseMonetizationEvent({
        ...validEvent,
        appVersion: "x".repeat(33),
      }),
    ).toBeNull();
  });
});
