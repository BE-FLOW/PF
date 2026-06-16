import { describe, expect, it } from "vitest";
import { analyzeLocally } from "./analysis";
import { buildVetReviewDraft } from "./vet-review-report";
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

describe("buildVetReviewDraft", () => {
  it("summarizes multiple days with check scores for vet review", () => {
    const draft = buildVetReviewDraft(
      [
        record("2026-06-10T00:00:00.000Z"),
        record("2026-06-12T00:00:00.000Z", { energy: "low" }),
      ],
      "보리",
      undefined,
      [],
      { generatedAt: "2026-06-15T00:00:00.000Z" },
    );

    expect(draft.title).toContain("수의사 검토용");
    expect(draft.timeline).toHaveLength(2);
    expect(draft.timeline[0]).toContain("CHECK SCORE");
    expect(draft.keyObservations).toContain("반복 관찰: 구토 2회");
    expect(draft.reviewStatus).toBe("unreviewed");
  });

  it("keeps owner-reported plan and follow-up progress separate from confirmed vet content", () => {
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
    const draft = buildVetReviewDraft(
      [record("2026-06-10T00:00:00.000Z")],
      "보리",
      plan,
      progress,
      { generatedAt: "2026-06-15T00:00:00.000Z" },
    );

    expect(draft.planAndProgress.join("\n")).toContain("보호자 기록 병원 계획");
    expect(draft.planAndProgress.join("\n")).toContain("3일 경과");
    expect(draft.planAndProgress.join("\n")).toContain("확인 전");
    expect(draft.copyText).toContain("[병원 계획과 경과 기록]");
    expect(draft.copyText).toContain("[다른 병원 첫 설명]");
    expect(draft.handoffNote).toContain("다른 병원");
  });

  it("states that the draft is not diagnosis or prescription", () => {
    const draft = buildVetReviewDraft(
      [record("2026-06-10T00:00:00.000Z")],
      "보리",
      undefined,
      [],
      { generatedAt: "2026-06-15T00:00:00.000Z" },
    );

    expect(draft.disclaimer).toContain("진단");
    expect(draft.disclaimer).toContain("처방");
    expect(draft.disclaimer).toContain("치료 계획");
  });

  it("keeps attached media as unreviewed reference material", () => {
    const item = record("2026-06-10T00:00:00.000Z");
    item.media = [
      {
        id: "90000000-0000-4000-8000-000000000001",
        reportId: item.result.id,
        petId: "40000000-0000-4000-8000-000000000001",
        episodeId: "50000000-0000-4000-8000-000000000001",
        kind: "image",
        fileName: "eye.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1200,
        storagePath: "user/pet/report/eye.jpg",
        createdAt: "2026-06-10T00:00:00.000Z",
      },
    ];
    const draft = buildVetReviewDraft(
      [item],
      "보리",
      undefined,
      [],
      { generatedAt: "2026-06-15T00:00:00.000Z" },
    );

    expect(draft.mediaSummary.join("\n")).toContain("사진 1개");
    expect(draft.mediaSummary.join("\n")).toContain("판독하지 않았습니다");
    expect(draft.copyText).toContain("[첨부 자료]");
    expect(draft.keyObservations.join("\n")).toContain("판독 전");
  });
});
