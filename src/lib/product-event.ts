import {
  parseMonetizationEvent,
  type MonetizationEventInput,
} from "./monetization";

export type ProductQualityEventInput = MonetizationEventInput & {
  eventName: "ai_summary_shared" | "factual_summary_shared";
  context: "report";
};

export const freeReleaseProductEventId = "petflow_free_release";

export function parseProductQualityEvent(
  value: unknown,
): ProductQualityEventInput | null {
  const event = parseMonetizationEvent(value);
  if (
    !event ||
    (event.eventName !== "ai_summary_shared" &&
      event.eventName !== "factual_summary_shared") ||
    event.context !== "report"
  ) {
    return null;
  }
  return event as ProductQualityEventInput;
}
