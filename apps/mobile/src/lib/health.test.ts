import { describe, expect, it } from "vitest";
import {
  analyzeLocally,
  buildEpisodeReport,
  hasDailyObservation,
  toggleDailyObservation,
  type HealthCheckInput,
  type HistoryRecord,
} from "./health";

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

describe("daily observation composer", () => {
  it("maps one-tap appetite and symptom choices to the saved input", () => {
    const appetiteChanged = toggleDailyObservation(base, "appetite");
    const withVomiting = toggleDailyObservation(appetiteChanged, "vomiting");

    expect(hasDailyObservation(withVomiting, "appetite")).toBe(true);
    expect(withVomiting.appetite).toBe("slight");
    expect(withVomiting.symptoms).toEqual(["vomiting"]);
  });

  it("turns an active choice off without changing unrelated fields", () => {
    const selected = toggleDailyObservation(base, "energy");
    const cleared = toggleDailyObservation(selected, "energy");

    expect(cleared.energy).toBe("normal");
    expect(cleared.petName).toBe("보리");
  });
});

describe("episode follow-up flow", () => {
  function record(createdAt: string): HistoryRecord {
    return {
      input: base,
      result: { ...analyzeLocally(base), createdAt },
    };
  }

  it("uses normal health records as follow-up checkpoints", () => {
    const report = buildEpisodeReport(
      [
        record("2026-06-10T00:00:00.000Z"),
        record("2026-06-13T00:00:00.000Z"),
        record("2026-06-17T00:00:00.000Z"),
      ],
      "보리",
      undefined,
      [],
      "2026-06-10T00:00:00.000Z",
    );

    expect(
      report.followUpCheckpoints
        .filter((checkpoint) => checkpoint.recordedAt)
        .map((checkpoint) => checkpoint.followUpDay),
    ).toEqual([3, 7]);
    expect(report.shareText).toContain("건강 기록 자동 연결");
  });
});
