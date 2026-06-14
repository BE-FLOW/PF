import { describe, expect, it } from "vitest";
import { analyzeLocally } from "./analysis";
import { summarizeHealthFlow } from "./health-flow";
import type { HealthCheckInput, HistoryRecord } from "./types";

const base: HealthCheckInput = {
  petName: "보리",
  species: "dog",
  ageGroup: "adult",
  symptoms: [],
  appetite: "normal",
  energy: "normal",
  duration: "today",
  redFlags: [],
  note: "",
};

function record(input: HealthCheckInput, daysAgo: number): HistoryRecord {
  const result = analyzeLocally(input);
  result.createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return { input, result };
}

describe("summarizeHealthFlow", () => {
  it("returns an empty state without records", () => {
    expect(summarizeHealthFlow([], "보리").recordCount).toBe(0);
  });

  it("finds symptoms repeated across records", () => {
    const records = [
      record({ ...base, symptoms: ["vomiting"] }, 0),
      record({ ...base, symptoms: ["vomiting"] }, 2),
    ];
    expect(summarizeHealthFlow(records, "보리").repeatedSymptoms).toContain(
      "구토 2회",
    );
  });

  it("marks an urgent recent record as worsening", () => {
    const records = [record({ ...base, redFlags: ["breathing"] }, 0)];
    expect(summarizeHealthFlow(records, "보리").trend).toBe("worsening");
  });
});
