import { describe, expect, it } from "vitest";
import type { VetReviewDraft } from "./types";
import {
  vetDraftGroundingViolation,
  vetDraftSafetyViolation,
} from "./vet-draft-safety";

function draftWith(text: string): VetReviewDraft {
  return {
    title: "병원 전달본",
    generatedAt: "2026-08-18T00:00:00.000Z",
    source: "openai",
    reviewStatus: "unreviewed",
    overview: text,
    handoffNote: "어제부터 보호자가 변화를 관찰했습니다.",
    keyObservations: ["보호자가 남긴 관찰 사실"],
    timeline: ["8월 18일: 변화 관찰"],
    mediaSummary: ["첨부 사진 1개"],
    planAndProgress: ["보호자가 옮긴 병원 안내 없음"],
    questionsForVet: ["반복 횟수 미입력"],
    submissionNote: "보호자 관찰을 정리한 확인 전 초안입니다.",
    disclaimer: "이 문서는 진단을 대신하지 않습니다.",
    copyText: text,
  };
}

describe("generated vet draft semantic safety", () => {
  it("allows a factual unreviewed observation summary", () => {
    expect(
      vetDraftSafetyViolation(
        draftWith("어제부터 식욕이 줄었다고 보호자가 기록했습니다."),
      ),
    ).toBeNull();
  });

  it("rejects a definitive diagnosis", () => {
    expect(
      vetDraftSafetyViolation(draftWith("세균 감염으로 진단됩니다.")),
    ).toBe("diagnosis");
  });

  it("rejects medication names and classes", () => {
    expect(
      vetDraftSafetyViolation(draftWith("아목시실린을 고려할 수 있습니다.")),
    ).toBe("medication");
    expect(
      vetDraftSafetyViolation(draftWith("항생제 사용을 검토합니다.")),
    ).toBe("medication");
    expect(
      vetDraftSafetyViolation(draftWith("세파렉신 처방을 권장합니다.")),
    ).toBe("medication");
  });

  it("rejects tentative disease claims", () => {
    expect(
      vetDraftSafetyViolation(
        draftWith("파보바이러스 감염 가능성이 높습니다."),
      ),
    ).toBe("diagnosis");
  });

  it("rejects dosing instructions", () => {
    expect(vetDraftSafetyViolation(draftWith("하루 2회 복용하세요."))).toBe(
      "dosage",
    );
    expect(vetDraftSafetyViolation(draftWith("5 mg을 투여합니다."))).toBe(
      "dosage",
    );
  });

  it("rejects generated treatment plans", () => {
    expect(
      vetDraftSafetyViolation(draftWith("수액 치료가 필요합니다.")),
    ).toBe("treatment_plan");
  });

  it("does not inspect owner-reported medication kept in provenance fields", () => {
    const draft = draftWith("어제부터 식욕이 줄었다고 기록했습니다.");
    draft.planAndProgress = ["보호자 메모: 아목시실린 5mg 하루 2회"];
    expect(vetDraftSafetyViolation(draft)).toBeNull();
  });

  it("rejects a new symptom and count that are absent from source records", () => {
    const source = draftWith("어제부터 식욕이 줄었다고 기록했습니다.");
    const generated = {
      ...source,
      overview: "오늘 혈변이 7회 관찰되었습니다.",
      source: "openai" as const,
    };
    expect(vetDraftGroundingViolation(generated, source)).toBe(
      "ungrounded_fact",
    );
  });

  it("allows generated wording when its observable facts and counts are grounded", () => {
    const source = draftWith("오늘 구토가 2회 있었다고 기록했습니다.");
    const generated = {
      ...source,
      overview: "보호자는 오늘 구토 2회를 관찰했습니다.",
      source: "openai" as const,
    };
    expect(vetDraftGroundingViolation(generated, source)).toBeNull();
  });
});
