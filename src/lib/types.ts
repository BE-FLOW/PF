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
  id?: string;
  name: string;
  species: Species;
  breed: string;
  birthDate: string;
  sex: PetSex;
  weight: string;
}

export interface TesterProfile {
  nickname: string;
  phone: string;
  ageBand: "" | "under-20" | "20s" | "30s" | "40s" | "50-plus";
  careExperience: "" | "first" | "under-3-years" | "over-3-years";
  consentVersion: string;
  consentedAt: string;
  phoneConsentedAt: string;
}

export interface AiAccessStatus {
  enabled: boolean;
  reason:
    | "active"
    | "no_code"
    | "revoked"
    | "monthly_limit"
    | "total_limit";
  grantId?: string;
  codeLabel?: string;
  monthlyReportLimit: number;
  totalReportLimit: number | null;
  usedThisMonth: number;
  usedTotal: number;
  remainingThisMonth: number;
  grantedAt?: string;
}

export interface AiReportFeedbackInput {
  usageId: string;
  episodeId?: string;
  usefulnessScore: 1 | 2 | 3 | 4 | 5;
  wouldPay: "no" | "maybe" | "yes";
  willingnessToPayKrw?: number | null;
  comment?: string;
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
  petId?: string;
  episodeId?: string;
  input: HealthCheckInput;
  result: AnalysisResult;
  feedback?: "helpful" | "not-helpful";
}

export type EpisodeStatus = "open" | "closed";

export interface PetEpisode {
  id: string;
  petId: string;
  status: EpisodeStatus;
  startedAt: string;
  lastActivityAt: string;
  closedAt: string | null;
}

export interface PlanTask {
  id: string;
  text: string;
  position: number;
  completedAt: string | null;
}

export interface EpisodePlan {
  id: string;
  episodeId: string;
  petId: string;
  sourceType: "owner";
  reviewStatus: "user_reported";
  reportedAt: string;
  tasks: PlanTask[];
}

export type FollowUpDay = 3 | 7 | 14 | 30 | 60 | 90;
export type ConditionChange = "better" | "same" | "worse";

export interface EpisodeProgress {
  id: string;
  episodeId: string;
  petId: string;
  followUpDay: FollowUpDay;
  conditionChange: ConditionChange;
  appetite: Level;
  energy: Level;
  sourceType: "owner";
  reviewStatus: "unreviewed";
  recordedAt: string;
}

export type HealthTrend = "stable" | "watch" | "worsening";

export interface HealthFlowSummary {
  trend: HealthTrend;
  headline: string;
  description: string;
  recordCount: number;
  repeatedSymptoms: string[];
  highestRisk: RiskLevel | null;
  latestRecordedAt: string | null;
  vetBrief: string;
}

export interface VetReviewDraft {
  title: string;
  generatedAt: string;
  source: "local" | "openai";
  reviewStatus: "unreviewed";
  usageId?: string;
  overview: string;
  handoffNote: string;
  keyObservations: string[];
  timeline: string[];
  planAndProgress: string[];
  questionsForVet: string[];
  submissionNote: string;
  disclaimer: string;
  copyText: string;
}
