import { isUuid } from "./report-storage";

export const monetizationEventNames = [
  "paywall_viewed",
  "paywall_closed",
  "purchase_started",
  "purchase_cancelled",
  "purchase_failed",
  "purchase_sync_delayed",
  "purchase_history_checked",
  "ai_summary_shared",
] as const;

export type MonetizationEventName = (typeof monetizationEventNames)[number];
export type MonetizationContext = "account" | "report";
export type MonetizationPlatform = "android" | "ios" | "web";

export interface MonetizationEventInput {
  eventId: string;
  eventName: MonetizationEventName;
  context: MonetizationContext;
  platform: MonetizationPlatform;
  appVersion?: string | null;
  appBuild?: string | null;
}

function optionalShortText(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && value.trim().length <= 32
    ? value.trim()
    : undefined;
}

export function parseMonetizationEvent(
  value: unknown,
): MonetizationEventInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const appVersion = optionalShortText(input.appVersion);
  const appBuild = optionalShortText(input.appBuild);

  if (
    typeof input.eventId !== "string" ||
    !isUuid(input.eventId) ||
    typeof input.eventName !== "string" ||
    !monetizationEventNames.includes(
      input.eventName as MonetizationEventName,
    ) ||
    (input.context !== "account" && input.context !== "report") ||
    (input.platform !== "android" &&
      input.platform !== "ios" &&
      input.platform !== "web") ||
    appVersion === undefined ||
    appBuild === undefined
  ) {
    return null;
  }

  return {
    eventId: input.eventId,
    eventName: input.eventName as MonetizationEventName,
    context: input.context,
    platform: input.platform,
    appVersion,
    appBuild,
  };
}
