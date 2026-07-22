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

  it("adds structured owner progress checkpoints to the share summary", () => {
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
      {
        id: "80000000-0000-4000-8000-000000000002",
        episodeId: "50000000-0000-4000-8000-000000000001",
        petId: "40000000-0000-4000-8000-000000000001",
        followUpDay: 30,
        conditionChange: "same",
        appetite: "normal",
        energy: "normal",
        sourceType: "owner",
        reviewStatus: "unreviewed",
        recordedAt: "2026-07-12T00:00:00.000Z",
      },
    ];
    const report = buildEpisodeReport(
      [record("2026-06-10T00:00:00.000Z")],
      "보리",
      undefined,
      progress,
    );

    expect(report.progress).toHaveLength(2);
    expect(report.shareText).toContain("[초기·장기 경과 · 보호자 기록]");
    expect(report.shareText).toContain("3일: 좋아짐");
    expect(report.shareText).toContain("30일: 비슷함");
    expect(report.shareText).toContain("수의사가 확인한 경과가 아닙니다");
  });

  it("maps ordinary health records to follow-up checkpoints automatically", () => {
    const report = buildEpisodeReport(
      [
        record("2026-06-10T00:00:00.000Z"),
        record("2026-06-14T00:00:00.000Z", { appetite: "normal" }),
        record("2026-06-18T00:00:00.000Z", { energy: "slight" }),
        record("2026-07-13T00:00:00.000Z", { appetite: "low" }),
      ],
      "보리",
      undefined,
      [],
      "2026-06-10T00:00:00.000Z",
    );

    const completed = report.followUpCheckpoints.filter(
      (checkpoint) => checkpoint.recordedAt,
    );
    expect(completed.map((checkpoint) => checkpoint.followUpDay)).toEqual([
      3,
      7,
      30,
    ]);
    expect(completed.every((checkpoint) => checkpoint.source === "health-record")).toBe(true);
    expect(report.shareText).toContain("건강 기록 자동 연결");
  });

  it("summarizes owner-uploaded media without interpreting it", () => {
    const item = record("2026-06-10T00:00:00.000Z");
    item.media = [
      {
        id: "90000000-0000-4000-8000-000000000001",
        reportId: item.result.id,
        petId: "40000000-0000-4000-8000-000000000001",
        episodeId: "50000000-0000-4000-8000-000000000001",
        kind: "image",
        fileName: "stool.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1200,
        storagePath: "user/pet/report/stool.jpg",
        createdAt: "2026-06-10T00:00:00.000Z",
      },
      {
        id: "90000000-0000-4000-8000-000000000002",
        reportId: item.result.id,
        petId: "40000000-0000-4000-8000-000000000001",
        episodeId: "50000000-0000-4000-8000-000000000001",
        kind: "video",
        fileName: "walk.mp4",
        mimeType: "video/mp4",
        sizeBytes: 2400,
        storagePath: "user/pet/report/walk.mp4",
        createdAt: "2026-06-10T00:00:00.000Z",
      },
    ];
    const report = buildEpisodeReport([item], "보리");

    expect(report.mediaCount).toBe(2);
    expect(report.timeline[0].imageCount).toBe(1);
    expect(report.timeline[0].videoCount).toBe(1);
    expect(report.shareText).toContain("[첨부 자료 · 보호자 저장]");
    expect(report.shareText).toContain("사진 1개, 영상 1개");
    expect(report.shareText).toContain("내용을 판독하지 않았습니다");
  });
});
