import { describe, expect, it } from "vitest";
import {
  hasDailyObservation,
  toggleDailyObservation,
  type HealthCheckInput,
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
});
