import type { AiAccessStatus } from "./types";

export const defaultAiSummaryProductId = "petflow_ai_summary_1";

export function resolveAiSummaryProductId(rawValue?: string) {
  const productId = rawValue?.trim();
  return productId || defaultAiSummaryProductId;
}

export function buildAiCreditAccessStatus(
  availableCredits: number,
  complimentaryCredits: number,
  purchasedCredits: number,
  usedTotal: number,
  options: {
    billingConfigured?: boolean;
    productId?: string;
  } = {},
): AiAccessStatus {
  const normalizedAvailableCredits = Math.max(availableCredits, 0);
  const normalizedComplimentaryCredits = Math.max(complimentaryCredits, 0);
  const normalizedPurchasedCredits = Math.max(purchasedCredits, 0);
  const normalizedUsedTotal = Math.max(usedTotal, 0);
  const billingConfigured = options.billingConfigured ?? false;

  return {
    enabled: normalizedAvailableCredits > 0,
    reason: normalizedAvailableCredits > 0 ? "active" : "no_credits",
    availableCredits: normalizedAvailableCredits,
    complimentaryCredits: normalizedComplimentaryCredits,
    purchasedCredits: normalizedPurchasedCredits,
    usedTotal: normalizedUsedTotal,
    billingConfigured,
    purchaseAvailable: billingConfigured,
    productId: resolveAiSummaryProductId(options.productId),
  };
}
