import { describe, expect, it } from "vitest";
import {
  buildEpisodeReport,
  formatSymptomSummary,
  hasDailyObservation,
  toggleDailyObservation,
  toggleSymptomDetail,
  type AnalysisResult,
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

  it("adds one-tap intake facts and clears them with the symptom", () => {
    const withVomiting = toggleDailyObservation(base, "vomiting");
    const detailed = toggleSymptomDetail(withVomiting, "vomiting", "repeated");

    expect(formatSymptomSummary(detailed)).toBe("구토 (짧은 시간에 반복)");
    const cleared = toggleDailyObservation(detailed, "vomiting");
    expect(cleared.symptomDetails).toEqual({});
  });

  it("replaces mutually exclusive intake facts in one tap", () => {
    const withVomiting = toggleDailyObservation(base, "vomiting");
    const once = toggleSymptomDetail(withVomiting, "vomiting", "once");
    const repeated = toggleSymptomDetail(once, "vomiting", "repeated");

    expect(repeated.symptomDetails?.vomiting).toEqual(["repeated"]);
  });
});

describe("hospital handoff flow", () => {
  function record(createdAt: string): HistoryRecord {
    const result: AnalysisResult = {
      id: `record-${createdAt}`,
      createdAt,
      riskLevel: "watch",
      riskScore: 8,
      headline: "지금은 차분히 관찰해도 좋아요",
      summary: "평소 상태에 가깝게 기록됐어요.",
      observations: [],
      actions: [],
      vetBrief: "보리의 기록",
      disclaimer: "수의사의 진단을 대신하지 않습니다.",
      source: "local",
      storage: "remote",
    };
    return {
      input: base,
      result,
    };
  }

  it("keeps legacy checkpoints internal and shares only the factual timeline", () => {
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
    expect(report.shareText).not.toContain("건강 기록 자동 연결");
    expect(report.shareText).not.toContain("초기·장기 경과");
    expect(report.shareText).not.toContain("앱 안내 단계");
  });

  it("puts the owner's one-line observation in the shared handoff", () => {
    const input = { ...base, note: "어제 저녁부터 두 번 토했어요." };
    const result: AnalysisResult = {
      ...record("2026-06-10T00:00:00.000Z").result,
      id: "record-with-note",
    };
    const report = buildEpisodeReport([{ input, result }], "보리");

    expect(report.shareText).toContain("보호자 메모: 어제 저녁부터 두 번 토했어요.");
  });
});
