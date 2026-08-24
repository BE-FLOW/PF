import { describe, expect, it, vi } from "vitest";
import { queryFreeDailyUsage } from "./check-free-validation.mjs";

describe("free validation usage query", () => {
  it("counts only free daily AI report usage", async () => {
    const result = { data: [], error: null };
    const gte = vi.fn().mockResolvedValue(result);
    const eq = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const since = "2026-08-01T00:00:00.000Z";

    await expect(queryFreeDailyUsage({ from }, since)).resolves.toBe(result);

    expect(from).toHaveBeenCalledWith("ai_report_usage");
    expect(eq).toHaveBeenCalledWith("access_mode", "free_daily");
    expect(gte).toHaveBeenCalledWith("generated_at", since);
  });
});
