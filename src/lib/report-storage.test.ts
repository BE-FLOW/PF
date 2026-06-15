import { describe, expect, it } from "vitest";
import { analyzeLocally } from "./analysis";
import {
  isUuid,
  storedReportToHistoryRecord,
  toStoredHealthReport,
} from "./report-storage";
import type { HealthCheckInput } from "./types";

const input: HealthCheckInput = {
  petName: "보리",
  species: "dog",
  breed: "말티즈",
  birthDate: "2021-05-02",
  sex: "neutered-male",
  ageGroup: "adult",
  weight: "4.2kg",
  symptoms: ["vomiting"],
  appetite: "slight",
  energy: "normal",
  duration: "today",
  redFlags: [],
  note: "아침에 두 번 토했어요.",
};

describe("report storage", () => {
  it("accepts UUIDs and rejects arbitrary identifiers", () => {
    expect(isUuid("20000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("device-1")).toBe(false);
  });

  it("stores structured analytics without personal or free-text fields", () => {
    const result = analyzeLocally(input);
    const stored = toStoredHealthReport(
      input,
      result,
      "20000000-0000-4000-8000-000000000001",
      {
        userId: "30000000-0000-4000-8000-000000000001",
        petId: "40000000-0000-4000-8000-000000000001",
        episodeId: "50000000-0000-4000-8000-000000000001",
      },
    );
    const serialized = JSON.stringify(stored);

    expect(stored.breed).toBe("말티즈");
    expect(stored.user_id).toBe("30000000-0000-4000-8000-000000000001");
    expect(stored.pet_id).toBe("40000000-0000-4000-8000-000000000001");
    expect(stored.episode_id).toBe("50000000-0000-4000-8000-000000000001");
    expect(serialized).not.toContain("보리");
    expect(serialized).not.toContain("2021-05-02");
    expect(serialized).not.toContain("아침에 두 번");
    expect(serialized).not.toContain(result.vetBrief);
  });

  it("rebuilds a display record from a stored structured report", () => {
    const result = analyzeLocally(input);
    const stored = toStoredHealthReport(
      input,
      result,
      "20000000-0000-4000-8000-000000000001",
      {
        petId: "40000000-0000-4000-8000-000000000001",
        episodeId: "50000000-0000-4000-8000-000000000001",
      },
    );
    const rebuilt = storedReportToHistoryRecord(stored, {
      id: stored.pet_id ?? undefined,
      name: "보리",
      species: "dog",
      breed: "말티즈",
      birthDate: "2021-05-02",
      sex: "neutered-male",
      weight: "4.2kg",
    });
    expect(rebuilt.result.id).toBe(stored.id);
    expect(rebuilt.input.petName).toBe("보리");
    expect(rebuilt.petId).toBe(stored.pet_id);
    expect(rebuilt.episodeId).toBe(stored.episode_id);
  });
});
