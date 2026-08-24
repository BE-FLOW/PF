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

export type SymptomDetailMap = Partial<Record<SymptomId, string[]>>;

export type RedFlagId = "breathing" | "collapse" | "seizure" | "bleeding";

export interface PetProfile {
  id?: string;
  name: string;
  species: Species;
  breed: string;
  birthDate: string;
  sex: PetSex;
  weight: string;
  photoPath?: string;
  photoUrl?: string;
}

export type VaccinationStatus = "scheduled" | "done";

export interface VaccinationRecord {
  id: string;
  petId: string;
  name: string;
  administeredAt: string | null;
  dueAt: string | null;
  status: VaccinationStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountProfile {
  nickname: string;
}

export interface AiAccessStatus {
  enabled: boolean;
  reason:
    | "active"
    | "daily_limit"
    | "attempt_limit"
    | "no_credits"
    | "unavailable";
  availableCredits: number;
  complimentaryCredits: number;
  purchasedCredits: number;
  usedTotal: number;
  billingConfigured: boolean;
  purchaseAvailable: boolean;
  productId: string;
  freeRelease: boolean;
  dailyLimit: number;
  attemptsToday: number;
  dailyAttemptLimit: number;
  resetsAt: string | null;
}

export interface AiReportFeedbackInput {
  usageId: string;
  usefulnessScore: 1 | 2 | 3 | 4 | 5;
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
  symptomDetails?: SymptomDetailMap;
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

export type ReportMediaKind = "image" | "video";

export interface ReportMediaAttachment {
  id: string;
  reportId: string;
  petId: string;
  episodeId: string;
  kind: ReportMediaKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
  signedUrl?: string;
}

export interface HistoryRecord {
  petId?: string;
  episodeId?: string;
  input: HealthCheckInput;
  result: AnalysisResult;
  media?: ReportMediaAttachment[];
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
  mediaSummary: string[];
  planAndProgress: string[];
  questionsForVet: string[];
  submissionNote: string;
  disclaimer: string;
  copyText: string;
}
