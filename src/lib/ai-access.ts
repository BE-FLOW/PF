import type { AiAccessStatus } from "./types";

export const defaultAiSummaryProductId = "petflow_ai_summary_1";
export const defaultFreeAiDailyLimit = 3;
export const maxFreeAiDailyLimit = 100;

export function freeAiDailyAttemptLimit(dailyLimit: number) {
  const normalizedLimit = Math.min(
    Math.max(Math.trunc(dailyLimit), 1),
    maxFreeAiDailyLimit,
  );
  return normalizedLimit * 3;
}

export function resolveFreeAiDailyLimit(rawValue?: string) {
  if (!rawValue?.trim()) return defaultFreeAiDailyLimit;
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maxFreeAiDailyLimit) {
    return defaultFreeAiDailyLimit;
  }
  return parsed;
}

export function freeAiServerConfiguration() {
  const dailyLimit = resolveFreeAiDailyLimit(process.env.FREE_AI_DAILY_LIMIT);
  return {
    freeRelease: true as const,
    generationConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    dailyLimit,
    dailyAttemptLimit: freeAiDailyAttemptLimit(dailyLimit),
  };
}

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
    freeRelease: false,
    dailyLimit: 0,
    attemptsToday: 0,
    dailyAttemptLimit: 0,
    resetsAt: null,
  };
}

export function buildFreeAiAccessStatus(
  usedToday: number,
  dailyLimit: number,
  resetsAt: string | null,
  attemptsToday = usedToday,
  dailyAttemptLimit = freeAiDailyAttemptLimit(dailyLimit),
): AiAccessStatus {
  const normalizedLimit = Math.min(
    Math.max(Math.trunc(dailyLimit), 1),
    maxFreeAiDailyLimit,
  );
  const normalizedUsed = Math.max(Math.trunc(usedToday), 0);
  const normalizedAttemptLimit = Math.max(
    Math.trunc(dailyAttemptLimit),
    normalizedLimit,
  );
  const normalizedAttempts = Math.max(Math.trunc(attemptsToday), 0);
  const available = Math.max(normalizedLimit - normalizedUsed, 0);
  const attemptLimitReached = normalizedAttempts >= normalizedAttemptLimit;

  return {
    enabled: available > 0 && !attemptLimitReached,
    reason:
      available <= 0
        ? "daily_limit"
        : attemptLimitReached
          ? "attempt_limit"
          : "active",
    availableCredits: available,
    complimentaryCredits: 0,
    purchasedCredits: 0,
    usedTotal: normalizedUsed,
    billingConfigured: false,
    purchaseAvailable: false,
    productId: "",
    freeRelease: true,
    dailyLimit: normalizedLimit,
    attemptsToday: normalizedAttempts,
    dailyAttemptLimit: normalizedAttemptLimit,
    resetsAt,
  };
}
