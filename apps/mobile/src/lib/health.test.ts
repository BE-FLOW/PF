import { describe, expect, it } from "vitest";
import {
  buildEpisodeReport,
  detectEmergencyRedFlags,
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

  it("matches explicit emergency wording without treating negations as alerts", () => {
    expect(detectEmergencyRedFlags("숨을 못 쉬고 의식이 없어요.")).toEqual([
      "breathing",
      "collapse",
    ]);
    expect(detectEmergencyRedFlags("경련이 반복되고 출혈이 안 멈춰요.")).toEqual([
      "seizure",
      "bleeding",
    ]);
    expect(detectEmergencyRedFlags("경련은 없고 출혈은 멈췄어요.")).toEqual([]);
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

  it("does not invent adult age or default observations in a factual handoff", () => {
    const input = { ...base, note: "사진만 저장했어요." };
    const result: AnalysisResult = {
      ...record("2026-06-10T00:00:00.000Z").result,
      id: "record-with-defaults",
    };
    const report = buildEpisodeReport([
      { input, result, media: [] },
    ], "보리");

    expect(report.petProfile).not.toContain("성견·성묘");
    expect(report.shareText).not.toContain("평소와 같음");
    expect(report.shareText).not.toContain("오늘부터");
    expect(report.shareText).not.toContain("식욕 변화 0회");
    expect(report.shareText).not.toContain("활력 변화 0회");
    expect(report.shareText).toContain("입력되지 않아 평가하지 않음");
    expect(report.shareText).toContain(
      "텍스트 공유에는 사진·영상 파일이 포함되지 않습니다",
    );
  });

  it("includes the age group when a valid birth date was actually recorded", () => {
    const input = { ...base, birthDate: "2021-05-02" };
    const report = buildEpisodeReport([
      { input, result: record("2026-06-10T00:00:00.000Z").result },
    ], "보리");

    expect(report.petProfile).toContain("성견·성묘");
  });

  it("shows an observation date in Korea without inventing a time", () => {
    const report = buildEpisodeReport(
      [record("2026-06-10T03:00:00.000Z")],
      "보리",
    );

    expect(report.timeline[0]?.dateLabel).toBe("2026년 6월 10일");
    expect(report.shareText).not.toMatch(/오전|오후|\d{1,2}:\d{2}/);
  });
});
