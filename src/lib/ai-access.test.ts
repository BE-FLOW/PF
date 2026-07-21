import { describe, expect, it } from "vitest";
import {
  buildStandardAiAccessStatus,
  defaultAiMonthlyReportLimit,
  resolveAiMonthlyReportLimit,
} from "./ai-access";

describe("AI report access", () => {
  it("gives every signed-in user a default monthly allowance", () => {
    expect(buildStandardAiAccessStatus(1, 3)).toMatchObject({
      enabled: true,
      reason: "active",
      monthlyReportLimit: defaultAiMonthlyReportLimit,
      remainingThisMonth: defaultAiMonthlyReportLimit - 1,
    });
  });

  it("stops generation when the monthly allowance is exhausted", () => {
    expect(buildStandardAiAccessStatus(5, 8, 5)).toMatchObject({
      enabled: false,
      reason: "monthly_limit",
      remainingThisMonth: 0,
    });
  });

  it("uses a safe default and caps configuration mistakes", () => {
    expect(resolveAiMonthlyReportLimit("0")).toBe(defaultAiMonthlyReportLimit);
    expect(resolveAiMonthlyReportLimit("not-a-number")).toBe(
      defaultAiMonthlyReportLimit,
    );
    expect(resolveAiMonthlyReportLimit("500")).toBe(100);
  });
});
