export interface MobileProductEvent {
  eventId: string;
  eventName: "ai_summary_shared" | "factual_summary_shared";
  context: "report";
  platform: "android" | "ios";
  appVersion: string | null;
  appBuild: string | null;
}

export async function recordMobileProductEvent({
  accessToken,
  apiBaseUrl,
  event,
}: {
  accessToken: string;
  apiBaseUrl: string;
  event: MobileProductEvent;
}) {
  try {
    const response = await fetch(`${apiBaseUrl}/api/product-events`, {
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
