import { analyzeLocally, profileToHealthInput } from "./analysis";
import type {
  AnalysisResult,
  HealthCheckInput,
  HistoryRecord,
  PetProfile,
  ReportMediaAttachment,
} from "./types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StoredHealthReport {
  id: string;
  client_id: string;
  user_id: string;
  pet_id: string;
  episode_id: string;
  species: HealthCheckInput["species"];
  breed: string | null;
  owner_note: string | null;
  age_group: HealthCheckInput["ageGroup"];
  symptoms: HealthCheckInput["symptoms"];
  symptom_details?: HealthCheckInput["symptomDetails"];
  appetite: HealthCheckInput["appetite"];
  energy: HealthCheckInput["energy"];
  duration: HealthCheckInput["duration"];
  red_flags: HealthCheckInput["redFlags"];
  risk_level: AnalysisResult["riskLevel"];
  risk_score: number;
  analysis_source: AnalysisResult["source"];
  app_version: string;
  deployment_environment: string;
  created_at: string;
}

export type DisplayHealthReport = Omit<
  StoredHealthReport,
  "client_id" | "user_id" | "app_version" | "deployment_environment"
> & {
  media?: ReportMediaAttachment[];
};

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
    userId: string;
    petId: string;
    episodeId: string;
  },
): StoredHealthReport {
  return {
    id: result.id,
    client_id: clientId,
    user_id: options.userId,
    pet_id: options.petId,
    episode_id: options.episodeId,
    species: input.species,
    breed: input.breed?.trim().slice(0, 80) || null,
    owner_note: input.note.trim().slice(0, 1000) || null,
    age_group: input.ageGroup,
    symptoms: input.symptoms,
    symptom_details: input.symptomDetails ?? {},
    appetite: input.appetite,
    energy: input.energy,
    duration: input.duration,
    red_flags: input.redFlags,
    risk_level: result.riskLevel,
    risk_score: result.riskScore,
    analysis_source: result.source,
    app_version: options.appVersion || "dev",
    deployment_environment: options.environment || "development",
    created_at: result.createdAt,
  };
}

export function storedReportToHistoryRecord(
  stored: DisplayHealthReport,
  profile: PetProfile,
): HistoryRecord {
  const input: HealthCheckInput = {
    ...profileToHealthInput(profile),
    ageGroup: stored.age_group,
    symptoms: stored.symptoms,
    symptomDetails: stored.symptom_details ?? {},
    appetite: stored.appetite,
    energy: stored.energy,
    duration: stored.duration,
    redFlags: stored.red_flags,
    note: stored.owner_note ?? "",
  };
  const generated = analyzeLocally(input);
  return {
    petId: stored.pet_id ?? profile.id,
    episodeId: stored.episode_id ?? undefined,
    input,
    result: {
      ...generated,
      id: stored.id,
      createdAt: stored.created_at,
      riskLevel: stored.risk_level,
      riskScore: stored.risk_score,
      source: stored.analysis_source,
      storage: "remote",
    },
    media: stored.media ?? [],
  };
}
