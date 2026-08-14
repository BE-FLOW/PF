"use client";

export interface WebBillingProduct {
  identifier: string;
  priceLabel: string;
}

export type WebPurchaseResult =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string };

export function isWebBillingAvailable() {
  return false;
}

export async function getWebBillingProduct(
  userId: string,
): Promise<WebBillingProduct | null> {
  void userId;
  return null;
}

export async function purchaseWebAiSummary(
  userId: string,
): Promise<WebPurchaseResult> {
  void userId;
  return {
    status: "unavailable",
    message: "병원 전달본 결제는 iOS 또는 Android 앱에서 이용해 주세요.",
  };
}
