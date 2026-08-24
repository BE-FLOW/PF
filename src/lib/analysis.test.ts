import { describe, expect, it } from "vitest";
import {
  analyzeLocally,
  detectEmergencyRedFlags,
  formatSymptomSummary,
  hasDailyObservation,
  deriveAgeGroup,
  isHealthCheckInput,
  profileToHealthInput,
  toggleDailyObservation,
} from "./analysis";
import type { HealthCheckInput } from "./types";

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

describe("analyzeLocally", () => {
  it("keeps a normal daily check in watch mode", () => {
    const result = analyzeLocally(base);
    expect(result.riskLevel).toBe("watch");
    expect(result.headline).toBe("입력된 정보만 사실대로 정리했어요");
    expect(result.summary).toContain("평가하지 않았어요");
    expect(result.summary).not.toContain("평소 상태");
    expect(result.vetBrief).not.toContain("성견·성묘");
    expect(result.vetBrief).not.toContain("오늘부터");
    expect(result.vetBrief).not.toContain("평소와 같음");
  });

  it("keeps a note-only record factual without a reassuring assessment", () => {
    const result = analyzeLocally({
      ...base,
      note: "산책 뒤 모습을 사진으로 남겼어요.",
    });

    expect(result.summary).toContain("메모는 입력한 원문으로만 정리");
    expect(result.summary).toContain("이미지가 있다면 그 내용도 판독하지 않았어요");
    expect(result.summary).not.toContain("큰 위험 신호는 보이지");
    expect(result.summary).not.toContain("차분히 관찰");
    expect(result.observations).toContain(
      "첨부 사진·영상: PetFlow가 내용을 판독하지 않음",
    );
  });

  it("always elevates a red flag to urgent", () => {
    const result = analyzeLocally({ ...base, redFlags: ["breathing"] });
    expect(result.riskLevel).toBe("urgent");
    expect(result.riskScore).toBeGreaterThanOrEqual(70);
  });

  it("recommends timely care for multiple persistent changes", () => {
    const result = analyzeLocally({
      ...base,
      symptoms: ["vomiting", "pain"],
      appetite: "low",
      energy: "low",
      duration: "4-7days",
    });
    expect(result.riskLevel).toBe("soon");
  });

  it("derives the lifecycle from a four-digit birth year", () => {
    expect(deriveAgeGroup("2026-01-01", new Date("2026-06-12"))).toBe("young");
    expect(deriveAgeGroup("2016-01-01", new Date("2026-06-12"))).toBe("senior");
  });

  it("includes lifecycle wording only when the birth date is known and valid", () => {
    const known = analyzeLocally({ ...base, birthDate: "2021-05-02" });
    const invalidLegacy = analyzeLocally({
      ...base,
      birthDate: "not-a-date",
      ageGroup: "adult",
    });

    expect(known.vetBrief).toContain("성견·성묘");
    expect(invalidLegacy.vetBrief).not.toContain("성견·성묘");
  });

  it("matches only explicit Korean emergency phrases deterministically", () => {
    expect(detectEmergencyRedFlags("호흡이 매우 힘들고 갑자기 쓰러졌어요.")).toEqual([
      "breathing",
      "collapse",
    ]);
    expect(detectEmergencyRedFlags("경련이 계속되고 피가 멈추지 않아요.")).toEqual([
      "seizure",
      "bleeding",
    ]);
    expect(detectEmergencyRedFlags("경련은 없고 피는 멈췄어요.")).toEqual([]);

    const urgent = analyzeLocally({
      ...base,
      note: "숨을 못 쉬고 있어요.",
    });
    expect(urgent.riskLevel).toBe("urgent");
    expect(urgent.summary).toContain("즉시 확인이 필요한 표현");
    expect(urgent.summary).not.toContain("진단");
  });

  it("reuses a saved pet profile without asking again", () => {
    const input = profileToHealthInput({
      name: "보리",
      species: "dog",
      breed: "말티즈",
      birthDate: "2021-05-02",
      sex: "neutered-male",
      weight: "4.2kg",
    });
    expect(input.petName).toBe("보리");
    expect(input.breed).toBe("말티즈");
    expect(input.symptoms).toEqual([]);
  });

  it("turns a daily observation into the existing health input safely", () => {
    const appetiteChanged = toggleDailyObservation(base, "appetite");
    expect(appetiteChanged.appetite).toBe("slight");
    expect(hasDailyObservation(appetiteChanged, "appetite")).toBe(true);

    const withSkinChange = toggleDailyObservation(appetiteChanged, "itching");
    expect(withSkinChange.symptoms).toContain("itching");
    const detailed = {
      ...withSkinChange,
      symptomDetails: { itching: ["paws"] },
    };
    const cleared = toggleDailyObservation(detailed, "itching");
    expect(cleared.symptoms).not.toContain("itching");
    expect(cleared.symptomDetails).toEqual({});
  });

  it("keeps symptom-specific intake facts in the factual summary", () => {
    const detailed: HealthCheckInput = {
      ...base,
      symptoms: ["vomiting"],
      symptomDetails: { vomiting: ["repeated", "food_or_yellow"] },
    };

    expect(formatSymptomSummary(detailed)).toBe(
      "구토 (짧은 시간에 반복, 먹은 것·노란 액체)",
    );
    expect(analyzeLocally(detailed).vetBrief).toContain("짧은 시간에 반복");
    expect(isHealthCheckInput(detailed)).toBe(true);
  });

  it("rejects unknown or duplicated observation values", () => {
    expect(isHealthCheckInput({ ...base, symptoms: ["vomiting", "vomiting"] })).toBe(false);
    expect(isHealthCheckInput({ ...base, redFlags: ["unknown"] })).toBe(false);
    expect(
      isHealthCheckInput({
        ...base,
        symptoms: ["vomiting"],
        symptomDetails: { vomiting: ["unknown"] },
      }),
    ).toBe(false);
    expect(
      isHealthCheckInput({
        ...base,
        symptoms: [],
        symptomDetails: { vomiting: ["once"] },
      }),
    ).toBe(false);
    expect(
      isHealthCheckInput({
        ...base,
        symptoms: ["vomiting"],
        symptomDetails: { vomiting: ["once", "repeated"] },
      }),
    ).toBe(false);
  });

  it("rejects malformed profile and oversized note fields", () => {
    expect(isHealthCheckInput({ ...base, birthDate: "2026-02-31" })).toBe(false);
    expect(isHealthCheckInput({ ...base, note: "가".repeat(1001) })).toBe(false);
  });
});
