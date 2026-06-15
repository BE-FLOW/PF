import { describe, expect, it } from "vitest";
import { analyzeLocally } from "./analysis";
import { buildEpisodeReport } from "./episode-report";
import type { HealthCheckInput, HistoryRecord } from "./types";

const base: HealthCheckInput = {
  petName: "보리",
  species: "dog",
  breed: "말티즈",
  ageGroup: "adult",
  symptoms: ["vomiting"],
  appetite: "slight",
  energy: "normal",
  duration: "2-3days",
  redFlags: [],
  note: "",
};

function record(createdAt: string, changes: Partial<HealthCheckInput> = {}): HistoryRecord {
  const input = { ...base, ...changes };
  return {
    input,
    result: { ...analyzeLocally(input), createdAt },
  };
}

describe("buildEpisodeReport", () => {
  it("summarizes repeated observations and changes across an episode", () => {
    const report = buildEpisodeReport([
      record("2026-06-10T00:00:00.000Z"),
      record("2026-06-12T00:00:00.000Z", { energy: "low" }),
    ]);

    expect(report.recordCount).toBe(2);
    expect(report.repeatedSymptoms).toContain("구토 2회");
    expect(report.appetiteChangeCount).toBe(2);
    expect(report.energyChangeCount).toBe(1);
    expect(report.shareText).toContain("[보호자 관찰 기록]");
  });

  it("states that the report is not a diagnosis or confirmed medical record", () => {
    const report = buildEpisodeReport([
      record("2026-06-10T00:00:00.000Z"),
    ]);

    expect(report.disclaimer).toContain("진단");
    expect(report.disclaimer).toContain("확인된 진료기록이 아닙니다");
  });

  it("does not place free-text notes into the share payload", () => {
    const report = buildEpisodeReport([
      record("2026-06-10T00:00:00.000Z", {
        note: "보호자만 보는 개인 메모",
      }),
    ]);

    expect(report.shareText).not.toContain("보호자만 보는 개인 메모");
  });
});
