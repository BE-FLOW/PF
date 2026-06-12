export type Species = "dog" | "cat" | "other";
export type PetSex =
  | "unknown"
  | "male"
  | "female"
  | "neutered-male"
  | "spayed-female";
export type Level = "normal" | "slight" | "low" | "none";
export type Duration = "today" | "2-3days" | "4-7days" | "over-week";
export type RiskLevel = "watch" | "soon" | "urgent";

export type SymptomId =
  | "vomiting"
  | "diarrhea"
  | "cough"
  | "itching"
  | "limping"
  | "eye"
  | "urination"
  | "pain";

export type RedFlagId = "breathing" | "collapse" | "seizure" | "bleeding";

export interface PetProfile {
  name: string;
  species: Species;
  breed: string;
  birthDate: string;
  sex: PetSex;
  weight: string;
}

export interface HealthCheckInput {
  petName: string;
  species: Species;
  breed?: string;
  birthDate?: string;
  sex?: PetSex;
  ageGroup: "young" | "adult" | "senior";
  weight?: string;
  symptoms: SymptomId[];
  appetite: Level;
  energy: Level;
  duration: Duration;
  redFlags: RedFlagId[];
  note: string;
}

export interface AnalysisResult {
  id: string;
  createdAt: string;
  riskLevel: RiskLevel;
  riskScore: number;
  headline: string;
  summary: string;
  observations: string[];
  actions: string[];
  vetBrief: string;
  disclaimer: string;
  source: "local" | "openai";
  storage?: "local" | "remote";
}

export interface HistoryRecord {
  input: HealthCheckInput;
  result: AnalysisResult;
  feedback?: "helpful" | "not-helpful";
}
