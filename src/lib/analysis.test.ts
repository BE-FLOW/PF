import { describe, expect, it } from "vitest";
import {
  analyzeLocally,
  hasDailyObservation,
  deriveAgeGroup,
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
    expect(toggleDailyObservation(withSkinChange, "itching").symptoms).not.toContain(
      "itching",
    );
  });
});
