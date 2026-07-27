"use client";

import {
  ErrorCode,
  Purchases,
  PurchasesError,
  type Package,
} from "@revenuecat/purchases-js";

export interface WebBillingProduct {
  identifier: string;
  priceLabel: string;
}

export type WebPurchaseResult =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string };

const webApiKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY?.trim() || null;
const productId =
  process.env.NEXT_PUBLIC_REVENUECAT_AI_SUMMARY_PRODUCT_ID?.trim() ||
  "petflow_ai_summary_1";

let purchases: Purchases | null = null;
let activeUserId: string | null = null;
let activePackage: Package | null = null;

export function isWebBillingAvailable() {
  return Boolean(webApiKey);
}

async function configuredPurchases(userId: string) {
  if (!webApiKey || !userId.trim()) return null;
  if (!purchases) {
    purchases = Purchases.configure(webApiKey, userId);
    activeUserId = userId;
  } else if (activeUserId !== userId) {
    await purchases.changeUser(userId);
    activeUserId = userId;
    activePackage = null;
  }
  return purchases;
}

async function loadPackage(userId: string) {
  const client = await configuredPurchases(userId);
  if (!client) return null;
  if (activePackage) return activePackage;

  const offerings = await client.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  activePackage =
    packages.find(
      (item) => item.webBillingProduct.identifier === productId,
    ) ?? null;
  return activePackage;
}

export async function getWebBillingProduct(
  userId: string,
): Promise<WebBillingProduct | null> {
  try {
    const rcPackage = await loadPackage(userId);
    return rcPackage
      ? {
          identifier: rcPackage.webBillingProduct.identifier,
          priceLabel: rcPackage.webBillingProduct.price.formattedPrice,
        }
      : null;
  } catch {
    return null;
  }
}

export async function purchaseWebAiSummary(
  userId: string,
): Promise<WebPurchaseResult> {
  try {
    const client = await configuredPurchases(userId);
    const rcPackage = await loadPackage(userId);
    if (!client || !rcPackage) {
      return {
        status: "unavailable",
        message: "결제 상품을 불러오지 못했어요.",
      };
    }
    await client.purchase({ rcPackage });
    return { status: "purchased" };
  } catch (error) {
    if (
      error instanceof PurchasesError &&
      error.errorCode === ErrorCode.UserCancelledError
    ) {
      return { status: "cancelled" };
    }
    return {
      status: "failed",
      message: "결제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
}
