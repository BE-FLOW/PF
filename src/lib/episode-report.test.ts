import { describe, expect, it } from "vitest";
import { analyzeLocally } from "./analysis";
import { buildEpisodeReport } from "./episode-report";
import type {
  EpisodePlan,
  EpisodeProgress,
  HealthCheckInput,
  HistoryRecord,
} from "./types";

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

  it("adds owner-reported hospital plan tasks without marking them confirmed", () => {
    const plan: EpisodePlan = {
      id: "60000000-0000-4000-8000-000000000001",
      episodeId: "50000000-0000-4000-8000-000000000001",
      petId: "40000000-0000-4000-8000-000000000001",
      sourceType: "owner",
      reviewStatus: "user_reported",
      reportedAt: "2026-06-15T00:00:00.000Z",
      tasks: [
        {
          id: "70000000-0000-4000-8000-000000000001",
          text: "3일 뒤 상태를 다시 확인하기",
          position: 0,
          completedAt: null,
        },
      ],
    };
    const report = buildEpisodeReport(
      [record("2026-06-10T00:00:00.000Z")],
      "보리",
      plan,
    );

    expect(report.planTasks).toHaveLength(1);
    expect(report.shareText).toContain("[병원에서 받은 계획 · 보호자 기록]");
    expect(report.shareText).toContain("3일 뒤 상태를 다시 확인하기");
    expect(report.shareText).toContain("수의사가 직접 확인한 내용이 아닙니다");
  });

  it("adds structured 3, 7, and 14 day owner progress to the share summary", () => {
    const progress: EpisodeProgress[] = [
      {
        id: "80000000-0000-4000-8000-000000000001",
        episodeId: "50000000-0000-4000-8000-000000000001",
        petId: "40000000-0000-4000-8000-000000000001",
        followUpDay: 3,
        conditionChange: "better",
        appetite: "normal",
        energy: "slight",
        sourceType: "owner",
        reviewStatus: "unreviewed",
        recordedAt: "2026-06-15T00:00:00.000Z",
      },
    ];
    const report = buildEpisodeReport(
      [record("2026-06-10T00:00:00.000Z")],
      "보리",
      undefined,
      progress,
    );

    expect(report.progress).toHaveLength(1);
    expect(report.shareText).toContain("[3일 · 7일 · 14일 경과 · 보호자 기록]");
    expect(report.shareText).toContain("3일: 좋아짐");
    expect(report.shareText).toContain("수의사가 확인한 경과가 아닙니다");
  });
});
