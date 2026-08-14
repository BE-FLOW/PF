import { timingSafeEqual } from "node:crypto";
import {
  revenueCatProductIds,
  revenueCatServerConfiguration,
} from "./billing-config";
import { isUuid } from "./report-storage";
import {
  recordAiCreditPurchase,
  recordBillingEvent,
  refundAiCreditPurchase,
  reverseAiCreditRefund,
} from "./supabase-admin";

const revenueCatApiBaseUrl = "https://api.revenuecat.com/v1";

type BillingStore = "app_store" | "play_store";
type BillingEnvironment = "sandbox" | "production";

interface RevenueCatNonSubscription {
  id?: string;
  is_sandbox?: boolean;
  purchase_date?: string;
  store?: string;
}

interface RevenueCatSubscriberResponse {
  subscriber?: {
    non_subscriptions?: Record<string, RevenueCatNonSubscription[]>;
  };
}

export interface RevenueCatWebhookEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  store?: string;
  environment?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  purchased_at_ms?: number;
  event_timestamp_ms?: number;
  price?: number;
  price_in_purchased_currency?: number;
  currency?: string;
  country_code?: string;
  quantity?: number;
  tax_percentage?: number;
  commission_percentage?: number;
}

export { revenueCatProductIds } from "./billing-config";

function billingStore(rawStore?: string): BillingStore | null {
  switch (rawStore?.toLowerCase()) {
    case "app_store":
    case "mac_app_store":
      return "app_store";
    case "play_store":
      return "play_store";
    default:
      return null;
  }
}

function billingEnvironment(rawEnvironment?: string): BillingEnvironment | null {
  switch (rawEnvironment?.toLowerCase()) {
    case "sandbox":
      return "sandbox";
    case "production":
      return "production";
    default:
      return null;
  }
}

function eventUserId(event: RevenueCatWebhookEvent) {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
  ];
  return candidates.find((candidate) => isUuid(candidate ?? "")) ?? null;
}

function isoFromMilliseconds(value?: number) {
  if (Number.isFinite(value)) {
    const date = new Date(value as number);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function optionalNonNegativeNumber(value?: number) {
  return Number.isFinite(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

function optionalPercentage(value?: number) {
  return Number.isFinite(value) && (value as number) >= 0 && (value as number) <= 1
    ? (value as number)
    : null;
}

function purchaseQuantity(value?: number) {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 100
    ? (value as number)
    : 1;
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyRevenueCatWebhookAuthorization(
  authorization: string | null,
) {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN?.trim();
  if (!secret || !authorization) return false;
  return (
    constantTimeEquals(authorization, secret) ||
    constantTimeEquals(authorization, `Bearer ${secret}`)
  );
}

export async function syncRevenueCatPurchases(userId: string) {
  const secretApiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  const configuration = revenueCatServerConfiguration();
  if (!secretApiKey || !configuration.productAllowlist || !isUuid(userId)) {
    return { configured: false, purchasesFound: 0, creditsRecorded: 0 };
  }

  const response = await fetch(
    `${revenueCatApiBaseUrl}/subscribers/${encodeURIComponent(userId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secretApiKey}`,
      },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`RevenueCat customer sync failed (${response.status})`);
  }

  const payload = (await response.json()) as RevenueCatSubscriberResponse;
  const allowedProductIds = revenueCatProductIds();
  let purchasesFound = 0;
  let creditsRecorded = 0;

  for (const [productId, purchases] of Object.entries(
    payload.subscriber?.non_subscriptions ?? {},
  )) {
    if (!allowedProductIds.has(productId)) continue;
    for (const purchase of purchases) {
      const store = billingStore(purchase.store);
      if (
        !purchase.id ||
        !store ||
        !purchase.purchase_date ||
        !Number.isFinite(Date.parse(purchase.purchase_date))
      ) {
        continue;
      }
      purchasesFound += 1;
      const purchaseId = await recordAiCreditPurchase({
        userId,
        transactionId: purchase.id,
        productId,
        store,
        environment: purchase.is_sandbox ? "sandbox" : "production",
        purchasedAt: purchase.purchase_date,
      });
      if (purchaseId) creditsRecorded += 1;
    }
  }

  return { configured: true, purchasesFound, creditsRecorded };
}

export async function processRevenueCatWebhook(
  event: RevenueCatWebhookEvent,
) {
  const eventId = event.id?.trim();
  const eventType = event.type?.trim();
  const productId = event.product_id?.trim();
  const transactionId =
    event.transaction_id?.trim() || event.original_transaction_id?.trim();
  const userId = eventUserId(event);

  if (!eventId || !eventType) {
    return { processed: false, status: "invalid" as const };
  }

  if (!productId || !revenueCatProductIds().has(productId)) {
    await recordBillingEvent({
      eventId,
      eventType,
      userId,
      transactionId,
      status: "ignored",
      errorCode: "unrelated_product",
    });
    return { processed: true, status: "ignored" as const };
  }

  const store = event.store ? billingStore(event.store) : null;
  if (event.store && !store) {
    await recordBillingEvent({
      eventId,
      eventType,
      userId,
      transactionId,
      status: "ignored",
      errorCode: "unsupported_store",
    });
    return { processed: true, status: "ignored" as const };
  }

  if (eventType === "NON_RENEWING_PURCHASE") {
    const environment = billingEnvironment(event.environment);
    if (!userId || !transactionId || !store || !environment) {
      await recordBillingEvent({
        eventId,
        eventType,
        userId,
        transactionId,
        status: "failed",
        errorCode: "invalid_purchase_event",
      });
      return { processed: false, status: "invalid" as const };
    }

    const purchaseId = await recordAiCreditPurchase({
      userId,
      transactionId,
      originalTransactionId: event.original_transaction_id,
      productId,
      store,
      environment,
      purchasedAt: isoFromMilliseconds(
        event.purchased_at_ms ?? event.event_timestamp_ms,
      ),
      credits: purchaseQuantity(event.quantity),
      priceUsd: optionalNonNegativeNumber(event.price),
      priceAmount: optionalNonNegativeNumber(
        event.price_in_purchased_currency,
      ),
      currency: event.currency,
      countryCode: event.country_code,
      quantity: purchaseQuantity(event.quantity),
      taxPercentage: optionalPercentage(event.tax_percentage),
      commissionPercentage: optionalPercentage(
        event.commission_percentage,
      ),
    });
    await recordBillingEvent({
      eventId,
      eventType,
      userId,
      transactionId,
      status: purchaseId ? "processed" : "failed",
      errorCode: purchaseId ? null : "purchase_record_failed",
    });
    return {
      processed: Boolean(purchaseId),
      status: purchaseId ? ("credited" as const) : ("failed" as const),
    };
  }

  if (eventType === "CANCELLATION" && transactionId) {
    const refunded = await refundAiCreditPurchase(
      transactionId,
      eventId,
      isoFromMilliseconds(event.event_timestamp_ms),
    );
    await recordBillingEvent({
      eventId,
      eventType,
      userId,
      transactionId,
      status: refunded ? "processed" : "failed",
      errorCode: refunded ? null : "purchase_not_found",
    });
    return {
      processed: refunded,
      status: refunded ? ("refunded" as const) : ("failed" as const),
    };
  }

  if (eventType === "REFUND_REVERSED" && transactionId) {
    const reversed = await reverseAiCreditRefund(
      transactionId,
      eventId,
      isoFromMilliseconds(event.event_timestamp_ms),
    );
    await recordBillingEvent({
      eventId,
      eventType,
      userId,
      transactionId,
      status: reversed ? "processed" : "failed",
      errorCode: reversed ? null : "purchase_not_found",
    });
    return {
      processed: reversed,
      status: reversed
        ? ("refund_reversed" as const)
        : ("failed" as const),
    };
  }

  await recordBillingEvent({
    eventId,
    eventType,
    userId,
    transactionId,
    status: "ignored",
    errorCode: "unsupported_event",
  });
  return { processed: true, status: "ignored" as const };
}
