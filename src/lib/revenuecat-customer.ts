import { isUuid } from "./report-storage";

const revenueCatApiBaseUrl = "https://api.revenuecat.com/v1";

export async function deleteRevenueCatCustomer(userId: string) {
  const secretApiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!secretApiKey) return true;
  if (!isUuid(userId)) return false;

  try {
    const response = await fetch(
      `${revenueCatApiBaseUrl}/subscribers/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${secretApiKey}`,
        },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      },
    );
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
