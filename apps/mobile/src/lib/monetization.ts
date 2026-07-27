import type { AiAccessStatus } from "./health";

export type MonetizationContext = "account" | "report";

export type MonetizationEventName =
  | "paywall_viewed"
  | "paywall_closed"
  | "purchase_started"
  | "purchase_cancelled"
  | "purchase_failed"
  | "purchase_sync_delayed"
  | "purchase_history_checked"
  | "ai_summary_shared";

export interface BillingSyncResult {
  access: AiAccessStatus | null;
  error: string | null;
}

export interface MobileMonetizationEvent {
  eventId: string;
  eventName: MonetizationEventName;
  context: MonetizationContext;
  platform: "android" | "ios";
  appVersion?: string | null;
  appBuild?: string | null;
}

const purchaseSyncDelaysMs = [0, 700, 1500, 2800] as const;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function syncBillingAccess(
  apiBaseUrl: string,
  accessToken: string,
): Promise<BillingSyncResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${apiBaseUrl}/api/billing/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access?: AiAccessStatus;
      error?: string;
    };
    return {
      access: payload.access ?? null,
      error: response.ok
        ? null
        : payload.error ?? "구매 내역을 확인하지 못했어요.",
    };
  } catch {
    return {
      access: null,
      error: "구매 내역을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncBillingAfterPurchase(
  sync: () => Promise<BillingSyncResult>,
  minimumCredits: number,
  sleep: (milliseconds: number) => Promise<unknown> = wait,
) {
  let latest: BillingSyncResult = { access: null, error: null };

  for (const delay of purchaseSyncDelaysMs) {
    if (delay) await sleep(delay);
    latest = await sync();
    if ((latest.access?.availableCredits ?? 0) >= minimumCredits) {
      return { ...latest, synced: true as const };
    }
  }

  return { ...latest, synced: false as const };
}

export async function recordMobileMonetizationEvent({
  accessToken,
  apiBaseUrl,
  event,
}: {
  accessToken: string;
  apiBaseUrl: string;
  event: MobileMonetizationEvent;
}) {
  try {
    const response = await fetch(`${apiBaseUrl}/api/billing/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
    return response.ok;
  } catch {
    return false;
  }
}
