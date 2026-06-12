import type { AnalysisResult, HealthCheckInput } from "./types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StoredHealthReport {
  id: string;
  client_id: string;
  user_id: string | null;
  pet_id: string | null;
  species: HealthCheckInput["species"];
  breed: string | null;
  age_group: HealthCheckInput["ageGroup"];
  symptoms: HealthCheckInput["symptoms"];
  appetite: HealthCheckInput["appetite"];
  energy: HealthCheckInput["energy"];
  duration: HealthCheckInput["duration"];
  red_flags: HealthCheckInput["redFlags"];
  risk_level: AnalysisResult["riskLevel"];
  risk_score: number;
  analysis_source: AnalysisResult["source"];
  app_version: string;
  deployment_environment: string;
  is_test: boolean;
  created_at: string;
}

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && uuidPattern.test(value));
}

export function toStoredHealthReport(
  input: HealthCheckInput,
  result: AnalysisResult,
  clientId: string,
  options: {
    appVersion?: string;
    environment?: string;
    isTest?: boolean;
    userId?: string | null;
    petId?: string | null;
  } = {},
): StoredHealthReport {
  return {
    id: result.id,
    client_id: clientId,
    user_id: options.userId ?? null,
    pet_id: options.petId ?? null,
    species: input.species,
    breed: input.breed?.trim().slice(0, 80) || null,
    age_group: input.ageGroup,
    symptoms: input.symptoms,
    appetite: input.appetite,
    energy: input.energy,
    duration: input.duration,
    red_flags: input.redFlags,
    risk_level: result.riskLevel,
    risk_score: result.riskScore,
    analysis_source: result.source,
    app_version: options.appVersion || "dev",
    deployment_environment: options.environment || "development",
    is_test: options.isTest ?? false,
    created_at: result.createdAt,
  };
}
