import type { AiAccessStatus } from "./types";

export const defaultAiMonthlyReportLimit = 5;

export function resolveAiMonthlyReportLimit(rawValue?: string) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return defaultAiMonthlyReportLimit;
  }
  return Math.min(parsed, 100);
}

export function buildStandardAiAccessStatus(
  usedThisMonth: number,
  usedTotal: number,
  monthlyReportLimit = defaultAiMonthlyReportLimit,
): AiAccessStatus {
  const normalizedUsedThisMonth = Math.max(usedThisMonth, 0);
  const normalizedUsedTotal = Math.max(usedTotal, 0);
  const remainingThisMonth = Math.max(
    monthlyReportLimit - normalizedUsedThisMonth,
    0,
  );

  return {
    enabled: remainingThisMonth > 0,
    accessMode: "standard",
    reason: remainingThisMonth > 0 ? "active" : "monthly_limit",
    monthlyReportLimit,
    totalReportLimit: null,
    usedThisMonth: normalizedUsedThisMonth,
    usedTotal: normalizedUsedTotal,
    remainingThisMonth,
  };
}
