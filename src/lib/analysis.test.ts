import { describe, expect, it } from "vitest";
import {
  analyzeLocally,
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
    expect(analyzeLocally(base).riskLevel).toBe("watch");
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
