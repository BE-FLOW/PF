import { formatRecordObservationDate } from "./record-calendar";

export type Species = "dog" | "cat" | "other";
export type PetSex = "unknown" | "male" | "female" | "neutered-male" | "spayed-female";
export type Level = "normal" | "slight" | "low" | "none";
export type Duration = "today" | "2-3days" | "4-7days" | "over-week";
export type RiskLevel = "watch" | "soon" | "urgent";
export type ReportMediaKind = "image" | "video";

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

export interface EpisodeReportTimelineItem {
  id: string;
  recordedAt: string;
  dateLabel: string;
  note: string;
  symptoms: string;
  appetite: string;
  energy: string;
  duration: string;
  riskLabel: string;
  imageCount: number;
  videoCount: number;
  mediaCount: number;
}

export interface EpisodeFollowUpCheckpoint {
  followUpDay: FollowUpDay;
  targetAt: string;
  recordedAt?: string;
  recordId?: string;
  source?: "health-record" | "manual";
  conditionChange?: EpisodeProgress["conditionChange"];
  appetite?: Level;
  energy?: Level;
}

export interface EpisodeReport {
  title: string;
  petProfile: string;
  periodLabel: string;
  recordCount: number;
  highestRiskLabel: string;
  repeatedSymptoms: string[];
  appetiteChangeCount: number;
  energyChangeCount: number;
  mediaCount: number;
  mediaSummary: string[];
  timeline: EpisodeReportTimelineItem[];
  planTasks: PlanTask[];
  progress: EpisodeProgress[];
  followUpCheckpoints: EpisodeFollowUpCheckpoint[];
  shareText: string;
  disclaimer: string;
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

export const symptomOptions: Array<{ id: SymptomId; label: string }> = [
  { id: "vomiting", label: "구토" },
  { id: "diarrhea", label: "설사" },
  { id: "cough", label: "기침" },
  { id: "itching", label: "가려움" },
  { id: "limping", label: "절뚝거림" },
  { id: "eye", label: "눈·귀 이상" },
  { id: "urination", label: "배뇨 변화" },
  { id: "pain", label: "통증 반응" },
];

export const symptomDetailQuestions: Record<
  SymptomId,
  {
    prompt: string;
    reportPrompt: string;
    options: Array<{ id: string; label: string }>;
    exclusiveGroups?: string[][];
  }
> = {
  vomiting: {
    prompt: "구토의 횟수·내용물",
    reportPrompt: "짧은 시간 내 반복 여부와 토한 내용물의 모습 미입력",
    options: [
      { id: "once", label: "한 번만" },
      { id: "repeated", label: "짧은 시간에 반복" },
      { id: "food_or_yellow", label: "먹은 것·노란 액체" },
      { id: "blood", label: "피가 보임" },
    ],
    exclusiveGroups: [["once", "repeated"]],
  },
  diarrhea: {
    prompt: "변의 양·모양",
    reportPrompt: "변의 양·횟수와 점액·색 변화 미입력",
    options: [
      { id: "watery", label: "물처럼 묽음" },
      { id: "repeated", label: "소량씩 자주" },
      { id: "mucus", label: "점액이 보임" },
      { id: "blood_or_black", label: "피·검은 변" },
    ],
  },
  cough: {
    prompt: "기침이 나타날 때",
    reportPrompt: "운동·흥분 후인지, 밤·휴식 중인지 미입력",
    options: [
      { id: "dry", label: "마른기침" },
      { id: "wet_sound", label: "가래 끓는 소리" },
      { id: "after_activity", label: "운동·흥분 후" },
      { id: "at_rest", label: "밤·휴식 중" },
    ],
  },
  itching: {
    prompt: "불편해하는 부위",
    reportPrompt: "주로 긁거나 핥는 부위와 피부 변화 미입력",
    options: [
      { id: "ear_face", label: "귀·얼굴" },
      { id: "paws", label: "발" },
      { id: "body", label: "배·몸통" },
      { id: "skin_change", label: "붉음·상처" },
    ],
  },
  limping: {
    prompt: "움직임에서 보인 점",
    reportPrompt: "앞·뒷다리와 체중을 싣는 정도, 활동 후 변화 미입력",
    options: [
      { id: "front_leg", label: "앞다리" },
      { id: "back_leg", label: "뒷다리" },
      { id: "not_bearing_weight", label: "발을 딛기 어려움" },
      { id: "after_activity", label: "활동 후 심함" },
    ],
  },
  eye: {
    prompt: "눈·귀에서 보인 점",
    reportPrompt: "눈·귀 중 보인 위치와 분비물·행동 변화 미입력",
    options: [
      { id: "eye_discharge", label: "눈곱·눈물" },
      { id: "eye_red_or_closed", label: "눈 충혈·감음" },
      { id: "ear_discharge", label: "귀 냄새·분비물" },
      { id: "ear_scratching", label: "귀를 긁거나 흔듦" },
    ],
  },
  urination: {
    prompt: "소변에서 달라진 점",
    reportPrompt: "배뇨 횟수·양과 힘주는 행동·색 변화 미입력",
    options: [
      { id: "frequent", label: "자주 감" },
      { id: "small_amount", label: "양이 줄음" },
      { id: "straining", label: "힘주지만 잘 안 나옴" },
      { id: "blood_or_color", label: "피·색 변화" },
    ],
  },
  pain: {
    prompt: "불편해하는 때",
    reportPrompt: "접촉·움직임·안아 올리기·휴식 중 반응 상황 미입력",
    options: [
      { id: "when_touched", label: "만질 때" },
      { id: "when_moving", label: "움직일 때" },
      { id: "when_lifted", label: "안아 올릴 때" },
      { id: "at_rest", label: "가만히 있어도" },
    ],
  },
};

export function selectedSymptomDetailLabels(
  input: HealthCheckInput,
  symptom: SymptomId,
) {
  const selected = new Set(input.symptomDetails?.[symptom] ?? []);
  return symptomDetailQuestions[symptom].options
    .filter((option) => selected.has(option.id))
    .map((option) => option.label);
}

export function formatSymptomSummary(input: HealthCheckInput) {
  return input.symptoms
    .map((symptom) => {
      const details = selectedSymptomDetailLabels(input, symptom);
      return details.length
        ? `${symptomOptions.find((option) => option.id === symptom)?.label ?? symptom} (${details.join(", ")})`
        : symptomOptions.find((option) => option.id === symptom)?.label ?? symptom;
    })
    .join(", ");
}

export function toggleSymptomDetail(
  input: HealthCheckInput,
  symptom: SymptomId,
  detailId: string,
): HealthCheckInput {
  const question = symptomDetailQuestions[symptom];
  if (!question.options.some((option) => option.id === detailId)) return input;

  const current = input.symptomDetails?.[symptom] ?? [];
  const exclusiveGroup = question.exclusiveGroups?.find((group) =>
    group.includes(detailId),
  );
  const withoutExclusiveAnswer = exclusiveGroup
    ? current.filter((item) => !exclusiveGroup.includes(item))
    : current;
  const next = current.includes(detailId)
    ? current.filter((item) => item !== detailId)
    : [...withoutExclusiveAnswer, detailId];
  return {
    ...input,
    symptomDetails: {
      ...(input.symptomDetails ?? {}),
      [symptom]: next,
    },
  };
}

export const levelOptions: Array<{ id: Level; label: string }> = [
  { id: "normal", label: "평소와 같음" },
  { id: "slight", label: "조금 줄었음" },
  { id: "low", label: "많이 줄었음" },
  { id: "none", label: "거의 없음" },
];

export type DailyObservationId = "appetite" | "energy" | SymptomId;

export const dailyObservationOptions: Array<{
  id: DailyObservationId;
  label: string;
}> = [
  { id: "appetite", label: "식사를 덜 해요" },
  { id: "energy", label: "기운이 덜해요" },
  { id: "vomiting", label: "토했어요" },
  { id: "diarrhea", label: "변이 달라요" },
  { id: "itching", label: "피부·털이 달라요" },
  { id: "eye", label: "눈·귀가 달라요" },
  { id: "limping", label: "움직임이 달라요" },
  { id: "urination", label: "소변이 달라요" },
  { id: "cough", label: "기침해요" },
  { id: "pain", label: "만지면 불편해해요" },
];

export function hasDailyObservation(
  input: HealthCheckInput,
  observation: DailyObservationId,
) {
  if (observation === "appetite") return input.appetite !== "normal";
  if (observation === "energy") return input.energy !== "normal";
  return input.symptoms.includes(observation);
}

export function toggleDailyObservation(
  input: HealthCheckInput,
  observation: DailyObservationId,
): HealthCheckInput {
  if (observation === "appetite") {
    return {
      ...input,
      appetite: input.appetite === "normal" ? "slight" : "normal",
    };
  }
  if (observation === "energy") {
    return {
      ...input,
      energy: input.energy === "normal" ? "slight" : "normal",
    };
  }
  return {
    ...input,
    symptoms: input.symptoms.includes(observation)
      ? input.symptoms.filter((item) => item !== observation)
      : [...input.symptoms, observation],
    symptomDetails: input.symptoms.includes(observation)
      ? Object.fromEntries(
          Object.entries(input.symptomDetails ?? {}).filter(
            ([symptom]) => symptom !== observation,
          ),
        )
      : input.symptomDetails,
  };
}

export const durationOptions: Array<{ id: Duration; label: string }> = [
  { id: "today", label: "오늘부터" },
  { id: "2-3days", label: "2~3일" },
  { id: "4-7days", label: "4~7일" },
  { id: "over-week", label: "1주 이상" },
];

export const redFlagOptions: Array<{ id: RedFlagId; label: string }> = [
  { id: "breathing", label: "호흡이 매우 힘들어 보여요" },
  { id: "collapse", label: "의식이 흐리거나 쓰러졌어요" },
  { id: "seizure", label: "경련이 있어요" },
  { id: "bleeding", label: "출혈이 멈추지 않아요" },
];

export const riskLabels: Record<RiskLevel, string> = {
  watch: "관찰",
  soon: "진료 권장",
  urgent: "즉시 상담",
};

const emergencyPhrasePatterns: Record<RedFlagId, readonly RegExp[]> = {
  breathing: [
    /(?:숨|호흡)(?:을|이)?\s*(?:거의\s*)?(?:못\s*(?:쉬|쉰)|안\s*(?:쉬|쉰)|멎|멈췄)/u,
    /(?:숨쉬기|호흡)(?:가|이)?\s*(?:매우|너무|심하게|몹시)\s*(?:힘들|어렵)/u,
  ],
  collapse: [
    /(?:갑자기\s*)?쓰러(?:졌|져\s*있|진\s*채)/u,
    /의식(?:이|을)?\s*(?:없|잃|돌아오지\s*않|희미|흐려)/u,
    /(?:불러도|깨워도|건드려도)\s*(?:전혀\s*)?반응(?:이)?\s*없/u,
    /기절(?:했|한\s*채)/u,
  ],
  seizure: [
    /(?:전신\s*)?경련(?:이|을)?\s*(?:있|해|하|반복|계속|중)/u,
    /발작(?:이|을)?\s*(?:있|해|하|반복|계속|중)/u,
    /(?:온몸|몸)(?:이)?\s*(?:뻣뻣해지며|심하게\s*떨며)\s*(?:의식|반응)(?:이)?\s*없/u,
  ],
  bleeding: [
    /(?:피|출혈)(?:가|이)?\s*(?:계속\s*)?(?:멈추지\s*않|안\s*멈(?:추|춰)|계속\s*(?:나|흐르)|쏟아)/u,
    /지혈(?:이)?\s*(?:안\s*되|되지\s*않)/u,
  ],
};

export function detectEmergencyRedFlags(text: string): RedFlagId[] {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return (Object.keys(emergencyPhrasePatterns) as RedFlagId[]).filter((flag) =>
    emergencyPhrasePatterns[flag].some((pattern) => pattern.test(normalized)),
  );
}

export function hasAssessableObservation(input: HealthCheckInput) {
  return Boolean(
    input.symptoms.length ||
      input.redFlags.length ||
      detectEmergencyRedFlags(input.note).length ||
      input.appetite !== "normal" ||
      input.energy !== "normal" ||
      input.duration !== "today",
  );
}

export const reportMediaBucket = "petflow-report-media";
export const petPhotoBucket = "petflow-pet-photos";
export const maxReportMediaFiles = 4;
export const maxReportMediaSizeBytes = 50 * 1024 * 1024;
export const maxPetPhotoSizeBytes = 5 * 1024 * 1024;
export const allowedReportMediaMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
export const allowedPetPhotoMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const allowedReportMediaMimeTypeSet = new Set<string>(
  allowedReportMediaMimeTypes,
);
const allowedPetPhotoMimeTypeSet = new Set<string>(allowedPetPhotoMimeTypes);

export function isAllowedPetPhotoMimeType(mimeType: string) {
  return allowedPetPhotoMimeTypeSet.has(mimeType);
}

export function reportMediaKindFromMimeType(
  mimeType: string,
): ReportMediaKind | null {
  if (!allowedReportMediaMimeTypeSet.has(mimeType)) return null;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

export function reportMediaExtensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "video/quicktime") return "mov";
  return mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
}

export function petPhotoExtensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  return mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "jpg";
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function formatReportMediaSummary(media: Array<{ kind: ReportMediaKind }>) {
  const { imageCount, videoCount } = countReportMedia(media);
  return formatReportMediaCount(imageCount, videoCount);
}

function countReportMedia(media: Array<{ kind: ReportMediaKind }>) {
  const imageCount = media.filter((item) => item.kind === "image").length;
  const videoCount = media.filter((item) => item.kind === "video").length;
  return { imageCount, videoCount, mediaCount: media.length };
}

function formatReportMediaCount(imageCount: number, videoCount: number) {
  return [
    imageCount ? `사진 ${imageCount}개` : "",
    videoCount ? `영상 ${videoCount}개` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

const symptomLabels: Record<SymptomId, string> = Object.fromEntries(
  symptomOptions.map((option) => [option.id, option.label]),
) as Record<SymptomId, string>;

const durationLabels: Record<Duration, string> = Object.fromEntries(
  durationOptions.map((option) => [option.id, option.label]),
) as Record<Duration, string>;

const levelLabels: Record<Level, string> = Object.fromEntries(
  levelOptions.map((option) => [option.id, option.label]),
) as Record<Level, string>;

const ageGroupLabels: Record<HealthCheckInput["ageGroup"], string> = {
  young: "어린 반려동물",
  adult: "성견·성묘",
  senior: "노령 반려동물",
};

const riskWeight: Record<RiskLevel, number> = {
  watch: 1,
  soon: 2,
  urgent: 3,
};

const dayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const followUpDays: FollowUpDay[] = [3, 7, 14, 30, 60, 90];
const followUpUpperBounds = [5, 11, 22, 45, 75, Number.POSITIVE_INFINITY];
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const koreaOffsetMilliseconds = 9 * 60 * 60 * 1000;

export function deriveAgeGroup(
  birthDate: string,
  now = new Date(),
): HealthCheckInput["ageGroup"] {
  if (!birthDate) return "adult";
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > now) return "adult";
  let age = now.getFullYear() - birth.getFullYear();
  const birthdayPassed =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!birthdayPassed) age -= 1;
  if (age < 1) return "young";
  if (age >= 8) return "senior";
  return "adult";
}

function hasKnownValidBirthDate(value: string | undefined, now = new Date()) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    parsed.getTime() <= now.getTime()
  );
}

export function profileToHealthInput(profile: PetProfile): HealthCheckInput {
  return {
    petName: profile.name,
    species: profile.species,
    breed: profile.breed || undefined,
    birthDate: profile.birthDate || undefined,
    sex: profile.sex,
    ageGroup: deriveAgeGroup(profile.birthDate),
    weight: profile.weight || undefined,
    symptoms: [],
    symptomDetails: {},
    appetite: "normal",
    energy: "normal",
    duration: "today",
    redFlags: [],
    note: "",
  };
}

export function resetToNormal(input: HealthCheckInput): HealthCheckInput {
  return {
    ...input,
    symptoms: [],
    symptomDetails: {},
    appetite: "normal",
    energy: "normal",
    duration: "today",
    redFlags: [],
    note: "",
  };
}

function koreaCalendarDay(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    ? Math.floor((timestamp + koreaOffsetMilliseconds) / millisecondsPerDay)
    : null;
}

function followUpDayForElapsedDays(elapsedDays: number): FollowUpDay | null {
  if (elapsedDays < 1) return null;
  const index = followUpUpperBounds.findIndex((upperBound) => elapsedDays < upperBound);
  return followUpDays[index] ?? null;
}

export function buildEpisodeFollowUpCheckpoints(
  records: HistoryRecord[],
  startedAt?: string,
  progress: EpisodeProgress[] = [],
): EpisodeFollowUpCheckpoint[] {
  const orderedRecords = [...records].sort(
    (a, b) =>
      new Date(a.result.createdAt).getTime() -
      new Date(b.result.createdAt).getTime(),
  );
  const referenceAt = startedAt ?? orderedRecords[0]?.result.createdAt;
  const referenceDay = referenceAt ? koreaCalendarDay(referenceAt) : null;
  const referenceTimestamp = referenceAt ? new Date(referenceAt).getTime() : Number.NaN;
  const recordsByCheckpoint = new Map<FollowUpDay, HistoryRecord>();

  if (referenceDay !== null) {
    for (const record of orderedRecords) {
      const recordDay = koreaCalendarDay(record.result.createdAt);
      if (recordDay === null) continue;
      const elapsedDays = recordDay - referenceDay;
      const checkpointDay = followUpDayForElapsedDays(elapsedDays);
      if (!checkpointDay) continue;

      const current = recordsByCheckpoint.get(checkpointDay);
      if (!current) {
        recordsByCheckpoint.set(checkpointDay, record);
        continue;
      }
      const currentDay = koreaCalendarDay(current.result.createdAt);
      if (currentDay === null) continue;
      const currentDistance = Math.abs(currentDay - referenceDay - checkpointDay);
      const nextDistance = Math.abs(elapsedDays - checkpointDay);
      if (
        nextDistance < currentDistance ||
        (nextDistance === currentDistance &&
          new Date(record.result.createdAt).getTime() >
            new Date(current.result.createdAt).getTime())
      ) {
        recordsByCheckpoint.set(checkpointDay, record);
      }
    }
  }

  const progressByCheckpoint = new Map(
    progress.map((item) => [item.followUpDay, item] as const),
  );

  return followUpDays.map((followUpDay) => {
    const record = recordsByCheckpoint.get(followUpDay);
    const manual = progressByCheckpoint.get(followUpDay);
    return {
      followUpDay,
      targetAt: Number.isFinite(referenceTimestamp)
        ? new Date(referenceTimestamp + followUpDay * millisecondsPerDay).toISOString()
        : "",
      recordedAt: manual?.recordedAt ?? record?.result.createdAt,
      recordId: manual ? undefined : record?.result.id,
      source: manual ? "manual" : record ? "health-record" : undefined,
      conditionChange: manual?.conditionChange,
      appetite: manual?.appetite ?? record?.input.appetite,
      energy: manual?.energy ?? record?.input.energy,
    };
  });
}

export function buildEpisodeReport(
  records: HistoryRecord[],
  fallbackPetName = "반려동물",
  plan?: EpisodePlan,
  progress: EpisodeProgress[] = [],
  episodeStartedAt?: string,
): EpisodeReport {
  const ordered = [...records].sort(
    (a, b) =>
      new Date(a.result.createdAt).getTime() -
      new Date(b.result.createdAt).getTime(),
  );
  const first = ordered[0];
  const latest = ordered.at(-1);
  const petName = latest?.input.petName || fallbackPetName;
  const latestObservationAt = latest
    ? new Date(latest.result.createdAt)
    : new Date();
  const petProfile = latest
    ? [
        latest.input.species === "dog"
          ? "강아지"
          : latest.input.species === "cat"
            ? "고양이"
            : "기타",
        latest.input.breed,
        hasKnownValidBirthDate(latest.input.birthDate, latestObservationAt)
          ? ageGroupLabels[latest.input.ageGroup]
          : "",
        latest.input.weight,
      ]
        .filter(Boolean)
        .join(" · ")
    : "프로필 정보 없음";
  const periodLabel =
    first && latest
      ? dayFormatter.format(new Date(first.result.createdAt)) ===
        dayFormatter.format(new Date(latest.result.createdAt))
        ? dayFormatter.format(new Date(first.result.createdAt))
        : `${dayFormatter.format(new Date(first.result.createdAt))} ~ ${dayFormatter.format(new Date(latest.result.createdAt))}`
      : "기록 없음";

  const symptomCounts = new Map<SymptomId, number>();
  for (const record of ordered) {
    for (const symptom of record.input.symptoms) {
      symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1);
    }
  }
  const repeatedSymptoms = [...symptomCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([symptom, count]) => `${symptomLabels[symptom]} ${count}회`)
    .slice(0, 3);
  const highestRisk = ordered.reduce<RiskLevel>(
    (highest, record) =>
      riskWeight[record.result.riskLevel] > riskWeight[highest]
        ? record.result.riskLevel
        : highest,
    "watch",
  );
  const appetiteChangeCount = ordered.filter(
    (record) => record.input.appetite !== "normal",
  ).length;
  const energyChangeCount = ordered.filter(
    (record) => record.input.energy !== "normal",
  ).length;
  const timeline = ordered.map<EpisodeReportTimelineItem>((record) => {
    const counts = countReportMedia(record.media ?? []);
    return {
      id: record.result.id,
      recordedAt: record.result.createdAt,
      dateLabel: formatRecordObservationDate(record.result.createdAt),
      note: record.input.note.trim(),
      symptoms: record.input.symptoms.length
        ? formatSymptomSummary(record.input)
        : "입력되지 않아 평가하지 않음",
      appetite:
        record.input.appetite === "normal"
          ? "입력되지 않아 평가하지 않음"
          : levelLabels[record.input.appetite],
      energy:
        record.input.energy === "normal"
          ? "입력되지 않아 평가하지 않음"
          : levelLabels[record.input.energy],
      duration:
        record.input.duration === "today"
          ? "입력되지 않아 평가하지 않음"
          : durationLabels[record.input.duration],
      riskLabel: riskLabels[record.result.riskLevel],
      ...counts,
    };
  });
  const mediaSummary = timeline
    .filter((item) => item.mediaCount > 0)
    .map(
      (item) =>
        `${item.dateLabel}: ${formatReportMediaCount(item.imageCount, item.videoCount)}`,
    );
  const mediaCount = timeline.reduce((total, item) => total + item.mediaCount, 0);
  const disclaimer =
    "이 요약은 보호자가 입력한 관찰과 앱의 안전 분류를 정리한 자료이며, 수의사의 진단이나 확인된 진료기록이 아닙니다.";
  const timelineText = timeline.length
    ? timeline
        .map(
          (item, index) =>
            `${index + 1}. ${item.dateLabel}${item.note ? `\n보호자 메모: ${item.note}` : ""}\n증상: ${item.symptoms}\n식욕: ${item.appetite} / 활력: ${item.energy}\n지속 기간: ${item.duration}${item.mediaCount ? `\n첨부: ${formatReportMediaCount(item.imageCount, item.videoCount)}` : ""}`,
        )
        .join("\n\n")
    : "기록 없음";
  const planText = plan?.tasks.length
    ? plan.tasks
        .map((task) => `- ${task.text}`)
        .join("\n")
    : "입력한 병원 안내가 없습니다.";
  const orderedProgress = [...progress].sort(
    (a, b) => a.followUpDay - b.followUpDay,
  );
  const followUpCheckpoints = buildEpisodeFollowUpCheckpoints(
    ordered,
    episodeStartedAt,
    orderedProgress,
  );
  const mediaText = mediaSummary.length
    ? [
        ...mediaSummary,
        "사진·영상은 보호자가 저장한 참고 자료이며 PetFlow가 내용을 판독하지 않았습니다.",
      ].join("\n")
    : "첨부 자료 없음";
  const shareText = [
    "[PetFlow 사실 요약]",
    `반려동물: ${petName} / ${petProfile}`,
    `기록 기간: ${periodLabel}`,
    `기록 횟수: ${timeline.length}회`,
    `반복 관찰: ${repeatedSymptoms.length ? repeatedSymptoms.join(", ") : "입력 없음"}`,
    `${appetiteChangeCount ? `식욕 변화 ${appetiteChangeCount}회` : "식욕 변화 입력 없음"} / ${energyChangeCount ? `활력 변화 ${energyChangeCount}회` : "활력 변화 입력 없음"}`,
    "",
    "[보호자 관찰 기록]",
    timelineText,
    "",
    "[첨부 자료 · 보호자 저장]",
    mediaText,
    "텍스트 공유에는 사진·영상 파일이 포함되지 않습니다. 파일은 앱에서 각각 따로 공유해 주세요.",
    "",
    "[병원에서 들은 내용 · 보호자 기록]",
    planText,
    "PetFlow에서 수의사가 직접 확인한 내용이 아닙니다.",
    "",
    "[확인 안내]",
    disclaimer,
  ].join("\n");

  return {
    title: `${petName} 사실 요약`,
    petProfile,
    periodLabel,
    recordCount: timeline.length,
    highestRiskLabel: riskLabels[highestRisk],
    repeatedSymptoms,
    appetiteChangeCount,
    energyChangeCount,
    mediaCount,
    mediaSummary,
    timeline,
    planTasks: plan?.tasks ?? [],
    progress: orderedProgress,
    followUpCheckpoints,
    shareText,
    disclaimer,
  };
}

export function toggleItem<T>(items: T[], item: T) {
  return items.includes(item)
    ? items.filter((value) => value !== item)
    : [...items, item];
}

export function createUuid() {
  const cryptoUuid = globalThis.crypto?.randomUUID?.();
  if (cryptoUuid) return cryptoUuid;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
