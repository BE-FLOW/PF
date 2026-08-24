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
  it("summarizes owner observations without presenting app scores as facts", () => {
    const draft = buildVetReviewDraft(
      [
        record("2026-06-10T00:00:00.000Z"),
        record("2026-06-12T00:00:00.000Z", {
          energy: "low",
          note: "산책 뒤 두 번 토하고 평소보다 처졌어요.",
        }),
      ],
      "보리",
      undefined,
      [],
      { generatedAt: "2026-06-15T00:00:00.000Z" },
    );

    expect(draft.title).toContain("병원 전달본");
    expect(draft.timeline).toHaveLength(2);
    expect(draft.timeline.join("\n")).toContain("산책 뒤 두 번 토하고");
    expect(draft.copyText).not.toContain("CHECK SCORE");
    expect(draft.copyText).not.toContain("가장 높은 앱 안내");
    expect(draft.keyObservations).toContain("반복 관찰: 구토 2회");
    expect(draft.reviewStatus).toBe("unreviewed");
    expect(draft.planAndProgress.join("\n")).not.toContain("자동 연결");
  });

  it("does not invent an observation time when the owner selected only a date", () => {
    const draft = buildVetReviewDraft(
      [record("2026-06-10T03:00:00.000Z")],
      "보리",
      undefined,
      [],
      { generatedAt: "2026-06-15T00:00:00.000Z" },
    );

    expect(draft.timeline[0]).toContain("2026년 6월 10일");
    expect(draft.timeline[0]).not.toMatch(/오전|오후|\d{1,2}:\d{2}/);
  });

  it("preserves answered symptom intake facts instead of asking them again", () => {
    const draft = buildVetReviewDraft(
      [
        record("2026-06-10T00:00:00.000Z", {
          symptomDetails: {
            vomiting: ["repeated", "food_or_yellow"],
          },
        }),
      ],
      "보리",
      undefined,
      [],
      { generatedAt: "2026-06-15T00:00:00.000Z" },
    );

    expect(draft.timeline[0]).toContain(
      "구토 (짧은 시간에 반복, 먹은 것·노란 액체)",
    );
    expect(draft.keyObservations.join("\n")).toContain("짧은 시간에 반복");
    expect(draft.questionsForVet).toEqual([]);
    expect(draft.copyText).not.toContain("[진료 중 추가 확인]");
  });

  it("lists only concise observable gaps when intake facts are missing", () => {
    const draft = buildVetReviewDraft(
      [record("2026-06-10T00:00:00.000Z")],
      "보리",
      undefined,
      [],
      { generatedAt: "2026-06-15T00:00:00.000Z" },
    );

    expect(draft.questionsForVet).toEqual([
      "구토: 짧은 시간 내 반복 여부와 토한 내용물의 모습 미입력",
    ]);
    expect(draft.copyText).toContain("[추가로 확인하면 좋은 사실]");
  });

  it("does not expose fixed follow-up checkpoints in the handoff", () => {
    const draft = buildVetReviewDraft(
      [record("2026-06-17T00:00:00.000Z")],
      "보리",
      undefined,
      [],
      {
        generatedAt: "2026-06-17T00:00:00.000Z",
        episodeStartedAt: "2026-06-10T00:00:00.000Z",
      },
    );

    expect(draft.planAndProgress.join("\n")).not.toContain("7일 전후");
    expect(draft.copyText).not.toContain("이어진 기록 시점");
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

    expect(draft.planAndProgress.join("\n")).toContain("보호자가 옮긴 병원 안내");
    expect(draft.planAndProgress.join("\n")).not.toContain("3일 전후 관찰");
    expect(draft.copyText).toContain("[병원에서 들은 내용 · 보호자 기록]");
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
    expect(draft.mediaSummary.join("\n")).toContain(
      "텍스트 공유에는 사진·영상 파일이 포함되지",
    );
    expect(draft.copyText).toContain("[첨부 자료]");
    expect(draft.keyObservations.join("\n")).toContain("판독 전");
  });

  it("marks unanswered defaults as unassessed instead of normal facts", () => {
    const draft = buildVetReviewDraft(
      [
        record("2026-06-10T00:00:00.000Z", {
          symptoms: [],
          appetite: "normal",
          energy: "normal",
          duration: "today",
          note: "",
        }),
      ],
      "보리",
      undefined,
      [],
      { generatedAt: "2026-06-15T00:00:00.000Z" },
    );

    expect(draft.timeline[0]).toContain("입력되지 않아 평가하지 않음");
    expect(draft.timeline[0]).not.toContain("평소와 같음");
    expect(draft.timeline[0]).not.toContain("오늘부터");
    expect(draft.keyObservations).toContain(
      "입력된 상태 정보가 부족해 PetFlow가 상태를 평가하지 않았습니다.",
    );
  });
});
