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

export interface DisplayHealthReport {
  id: string;
  pet_id: string | null;
  episode_id: string | null;
  species: Species;
  breed: string | null;
  age_group: HealthCheckInput["ageGroup"];
  symptoms: SymptomId[];
  appetite: Level;
  energy: Level;
  duration: Duration;
  red_flags: RedFlagId[];
  risk_level: RiskLevel;
  risk_score: number;
  analysis_source: AnalysisResult["source"];
  created_at: string;
  media?: ReportMediaAttachment[];
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

export interface EpisodeReportTimelineItem {
  id: string;
  recordedAt: string;
  dateLabel: string;
  symptoms: string;
  appetite: string;
  energy: string;
  duration: string;
  riskLabel: string;
  redFlagCount: number;
  imageCount: number;
  videoCount: number;
  mediaCount: number;
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
  shareText: string;
  disclaimer: string;
}

export interface AiAccessStatus {
  enabled: boolean;
  accessMode: "standard" | "code";
  reason:
    | "active"
    | "no_code"
    | "revoked"
    | "monthly_limit"
    | "total_limit"
    | "unavailable";
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

export const levelOptions: Array<{ id: Level; label: string }> = [
  { id: "normal", label: "평소와 같음" },
  { id: "slight", label: "조금 줄었음" },
  { id: "low", label: "많이 줄었음" },
  { id: "none", label: "거의 없음" },
];

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

const levelScore: Record<Level, number> = {
  normal: 0,
  slight: 8,
  low: 16,
  none: 27,
};

const symptomScore: Record<SymptomId, number> = {
  vomiting: 10,
  diarrhea: 8,
  cough: 10,
  itching: 5,
  limping: 8,
  eye: 7,
  urination: 13,
  pain: 15,
};

const riskWeight: Record<RiskLevel, number> = {
  watch: 1,
  soon: 2,
  urgent: 3,
};

const conditionChangeLabels: Record<ConditionChange, string> = {
  better: "좋아짐",
  same: "비슷함",
  worse: "나빠짐",
};

const dayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const disclaimer =
  "이 결과는 보호자의 기록 정리를 돕는 참고 정보이며 수의사의 진단을 대신하지 않습니다. 상태가 빠르게 악화되거나 호흡 곤란, 의식 저하, 경련, 지속 출혈이 있으면 즉시 가까운 동물병원에 연락하세요.";

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
    appetite: "normal",
    energy: "normal",
    duration: "today",
    redFlags: [],
    note: "",
  };
}

function riskCopy(level: RiskLevel) {
  if (level === "urgent") {
    return {
      headline: "지금 바로 병원에 연락해 주세요",
      summary:
        "즉시 확인이 필요한 위험 신호가 기록되었습니다. 이동 전에 가까운 동물병원에 전화해 현재 상태를 알리는 것이 좋습니다.",
    };
  }
  if (level === "soon") {
    return {
      headline: "가까운 시일 내 진료를 권장해요",
      summary:
        "증상과 컨디션 저하가 함께 보여 전문적인 확인이 필요할 수 있습니다. 가능하면 24시간 안에 병원 상담 일정을 잡아 주세요.",
    };
  }
  return {
    headline: "지금은 차분히 관찰해도 좋아요",
    summary:
      "현재 기록만으로는 즉시 진료가 필요한 뚜렷한 위험 신호가 보이지 않습니다. 변화가 생기는지 같은 기준으로 꾸준히 관찰해 주세요.",
  };
}

export function analyzeLocally(input: HealthCheckInput): AnalysisResult {
  let score = input.symptoms.reduce(
    (total, symptom) => total + symptomScore[symptom],
    0,
  );
  score += levelScore[input.appetite] + levelScore[input.energy];
  score +=
    input.duration === "2-3days"
      ? 5
      : input.duration === "4-7days"
        ? 12
        : input.duration === "over-week"
          ? 18
          : 0;
  score += input.ageGroup === "senior" ? 5 : 0;
  score += input.redFlags.length > 0 ? 70 : 0;
  score = Math.min(100, Math.max(8, score));

  const riskLevel: RiskLevel =
    input.redFlags.length > 0 || score >= 70
      ? "urgent"
      : score >= 38
        ? "soon"
        : "watch";
  const copy = riskCopy(riskLevel);
  const symptomText = input.symptoms.length
    ? input.symptoms.map((item) => symptomLabels[item]).join(", ")
    : "선택한 주요 증상 없음";
  const profileLine = [
    input.species === "dog" ? "강아지" : input.species === "cat" ? "고양이" : "기타",
    input.breed,
    ageGroupLabels[input.ageGroup],
    input.weight,
  ]
    .filter(Boolean)
    .join(" · ");

  const changedBits = [
    input.symptoms.length ? symptomText : "",
    input.appetite !== "normal" ? `식욕 ${levelLabels[input.appetite]}` : "",
    input.energy !== "normal" ? `활력 ${levelLabels[input.energy]}` : "",
    input.duration !== "today" ? durationLabels[input.duration] : "",
  ].filter(Boolean);
  const summaryDetail = changedBits.length
    ? `${changedBits.join(" · ")}로 기록됐어요.`
    : "오늘은 선택한 주요 증상 없이 평소 상태에 가깝게 기록됐어요.";

  const observations = [
    input.symptoms.length
      ? `선택한 증상: ${symptomText}`
      : "주요 증상은 따로 선택하지 않았어요.",
    `이어진 기간: ${durationLabels[input.duration]}`,
    `식욕 ${levelLabels[input.appetite]} · 활력 ${levelLabels[input.energy]}`,
    input.note.trim()
      ? "추가 메모가 있어 병원 공유용 요약에 함께 정리했어요."
      : "짧은 메모가 없어도 선택한 항목만으로 기록을 만들었어요.",
  ];

  const actions =
    riskLevel === "urgent"
      ? [
          "이동 전에 동물병원에 전화해 위험 신호를 먼저 전달하세요.",
          "가능하면 증상이 시작된 시각과 변화를 메모해 함께 보여 주세요.",
          "사진·영상이 있다면 이동 중 새로 찍기보다 저장된 자료만 챙겨 보여 주세요.",
        ]
      : riskLevel === "soon"
        ? [
            "24시간 안에 동물병원 또는 수의사 상담을 예약해 보세요.",
            "상담 전 같은 기준으로 한 번 더 기록하면 변화 설명이 쉬워요.",
            "증상이 심해지거나 위험 신호가 생기면 바로 병원에 연락하세요.",
          ]
        : [
            "6~12시간 간격으로 식욕, 활력, 배변·배뇨 상태를 다시 확인하세요.",
            "말로 설명하기 어려운 장면은 사진·영상으로 한 번만 남겨 두세요.",
            "증상이 이어지거나 새로운 변화가 생기면 병원 상담을 고려하세요.",
          ];

  return {
    id: createUuid(),
    createdAt: new Date().toISOString(),
    riskLevel,
    riskScore: score,
    headline: copy.headline,
    summary:
      riskLevel === "urgent"
        ? `${summaryDetail} 위험 신호가 포함되어 있어 병원에 먼저 연락하는 흐름이 맞아요.`
        : riskLevel === "soon"
          ? `${summaryDetail} 지금 바로 응급이라고 단정할 수는 없지만, 같은 상태가 이어지면 상담 일정을 잡아두는 편이 안전해요.`
          : `${summaryDetail} 큰 위험 신호는 보이지 않지만, 같은 기준으로 한 번 더 남기면 변화 흐름을 보기 쉬워요.`,
    observations,
    actions,
    vetBrief: `${input.petName || "반려동물"} / ${profileLine}\n증상: ${symptomText}\n기간: ${durationLabels[input.duration]}\n식욕: ${levelLabels[input.appetite]} / 활력: ${levelLabels[input.energy]}${input.note ? `\n보호자 메모: ${input.note}` : ""}`,
    disclaimer,
    source: "local",
  };
}

export function resetToNormal(input: HealthCheckInput): HealthCheckInput {
  return {
    ...input,
    symptoms: [],
    appetite: "normal",
    energy: "normal",
    duration: "today",
    redFlags: [],
    note: "",
  };
}

export function storedReportToHistoryRecord(
  stored: DisplayHealthReport,
  profile: PetProfile,
): HistoryRecord {
  const input: HealthCheckInput = {
    ...profileToHealthInput(profile),
    symptoms: stored.symptoms,
    appetite: stored.appetite,
    energy: stored.energy,
    duration: stored.duration,
    redFlags: stored.red_flags,
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

export function summarizeHealthFlow(
  records: HistoryRecord[],
  petName = "반려동물",
  now = new Date(),
): HealthFlowSummary {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 14);
  const recent = [...records]
    .filter((record) => new Date(record.result.createdAt) >= cutoff)
    .sort(
      (a, b) =>
        new Date(b.result.createdAt).getTime() -
        new Date(a.result.createdAt).getTime(),
    );

  if (!recent.length) {
    return {
      trend: "stable",
      headline: "아직 건강 흐름을 만들 기록이 없어요",
      description: "",
      recordCount: 0,
      repeatedSymptoms: [],
      highestRisk: null,
      latestRecordedAt: null,
      vetBrief: `${petName}의 최근 14일 건강 기록이 아직 없습니다.`,
    };
  }

  const symptomCounts = new Map<SymptomId, number>();
  for (const record of recent) {
    for (const symptom of record.input.symptoms) {
      symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1);
    }
  }
  const repeatedSymptoms = [...symptomCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([symptom, count]) => `${symptomLabels[symptom]} ${count}회`)
    .slice(0, 3);

  const highestRisk = recent.reduce<RiskLevel>(
    (highest, record) =>
      riskWeight[record.result.riskLevel] > riskWeight[highest]
        ? record.result.riskLevel
        : highest,
    "watch",
  );
  const latestScores = recent.slice(0, 3).map((record) => record.result.riskScore);
  const olderScores = recent.slice(3, 6).map((record) => record.result.riskScore);
  const average = (values: number[]) =>
    values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
  const scoreRise = olderScores.length
    ? average(latestScores) - average(olderScores)
    : 0;
  const worsening = highestRisk === "urgent" || scoreRise >= 15;
  const needsWatch =
    !worsening &&
    (highestRisk === "soon" ||
      repeatedSymptoms.length > 0 ||
      recent.some(
        (record) =>
          record.input.appetite !== "normal" || record.input.energy !== "normal",
      ));
  const trend = worsening ? "worsening" : needsWatch ? "watch" : "stable";

  const copy =
    trend === "worsening"
      ? {
          headline: "최근 기록에서 더 주의할 변화가 보여요",
          description:
            "최근 점수 상승이나 위험 신호가 있어 병원 상담 시 흐름을 함께 보여주세요.",
        }
      : trend === "watch"
        ? {
            headline: "반복되는 변화를 조금 더 지켜봐 주세요",
            description:
              "증상이나 컨디션 변화를 같은 기준으로 기록해 주세요.",
          }
        : {
            headline: "최근 기록은 비교적 안정적인 흐름이에요",
            description:
              "뚜렷한 반복 변화는 보이지 않아요. 지금처럼 간단히 이어서 기록해 주세요.",
          };
  const abnormalConditionCount = recent.filter(
    (record) =>
      record.input.appetite !== "normal" || record.input.energy !== "normal",
  ).length;
  const vetBrief = [
    `${petName} 최근 14일 건강 흐름`,
    `기록 ${recent.length}회`,
    `가장 높은 단계: ${riskLabels[highestRisk]}`,
    repeatedSymptoms.length
      ? `반복 기록: ${repeatedSymptoms.join(", ")}`
      : "반복된 주요 증상 없음",
    `식욕 또는 활력 변화 ${abnormalConditionCount}회`,
  ].join("\n");

  return {
    trend,
    ...copy,
    recordCount: recent.length,
    repeatedSymptoms,
    highestRisk,
    latestRecordedAt: recent[0].result.createdAt,
    vetBrief,
  };
}

export function buildEpisodeReport(
  records: HistoryRecord[],
  fallbackPetName = "반려동물",
  plan?: EpisodePlan,
  progress: EpisodeProgress[] = [],
): EpisodeReport {
  const ordered = [...records].sort(
    (a, b) =>
      new Date(a.result.createdAt).getTime() -
      new Date(b.result.createdAt).getTime(),
  );
  const first = ordered[0];
  const latest = ordered.at(-1);
  const petName = latest?.input.petName || fallbackPetName;
  const petProfile = latest
    ? [
        latest.input.species === "dog"
          ? "강아지"
          : latest.input.species === "cat"
            ? "고양이"
            : "기타",
        latest.input.breed,
        ageGroupLabels[latest.input.ageGroup],
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
      dateLabel: dateTimeFormatter.format(new Date(record.result.createdAt)),
      symptoms: record.input.symptoms.length
        ? record.input.symptoms
            .map((symptom) => symptomLabels[symptom])
            .join(", ")
        : "선택한 주요 증상 없음",
      appetite: levelLabels[record.input.appetite],
      energy: levelLabels[record.input.energy],
      duration: durationLabels[record.input.duration],
      riskLabel: riskLabels[record.result.riskLevel],
      redFlagCount: record.input.redFlags.length,
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
            `${index + 1}. ${item.dateLabel}\n증상: ${item.symptoms}\n식욕: ${item.appetite} / 활력: ${item.energy}\n지속 기간: ${item.duration} / 앱 안내: ${item.riskLabel}${item.redFlagCount ? ` / 위험 신호 ${item.redFlagCount}개 입력` : ""}${item.mediaCount ? `\n첨부: ${formatReportMediaCount(item.imageCount, item.videoCount)}` : ""}`,
        )
        .join("\n\n")
    : "기록 없음";
  const planText = plan?.tasks.length
    ? plan.tasks
        .map(
          (task) =>
            `- [${task.completedAt ? "완료" : "진행 전"}] ${task.text}`,
        )
        .join("\n")
    : "아직 입력한 계획이 없습니다.";
  const orderedProgress = [...progress].sort(
    (a, b) => a.followUpDay - b.followUpDay,
  );
  const progressText = orderedProgress.length
    ? orderedProgress
        .map(
          (item) =>
            `${item.followUpDay}일: ${conditionChangeLabels[item.conditionChange]} / 식욕 ${levelLabels[item.appetite]} / 활력 ${levelLabels[item.energy]}`,
        )
        .join("\n")
    : "아직 입력한 경과 기록이 없습니다.";
  const mediaText = mediaSummary.length
    ? [
        ...mediaSummary,
        "사진·영상은 보호자가 저장한 참고 자료이며 PetFlow가 내용을 판독하지 않았습니다.",
      ].join("\n")
    : "첨부 자료 없음";
  const shareText = [
    "[PetFlow 병원 전달 요약]",
    `반려동물: ${petName} / ${petProfile}`,
    `기록 기간: ${periodLabel}`,
    `기록 횟수: ${timeline.length}회`,
    `가장 높은 앱 안내 단계: ${riskLabels[highestRisk]}`,
    `반복 관찰: ${repeatedSymptoms.length ? repeatedSymptoms.join(", ") : "없음"}`,
    `식욕 변화 ${appetiteChangeCount}회 / 활력 변화 ${energyChangeCount}회`,
    "",
    "[보호자 관찰 기록]",
    timelineText,
    "",
    "[첨부 자료 · 보호자 저장]",
    mediaText,
    "",
    "[병원에서 받은 계획 · 보호자 기록]",
    planText,
    "PetFlow에서 수의사가 직접 확인한 내용이 아닙니다.",
    "",
    "[초기·장기 경과 · 보호자 기록]",
    progressText,
    "PetFlow에서 수의사가 확인한 경과가 아닙니다.",
    "",
    "[확인 안내]",
    disclaimer,
  ].join("\n");

  return {
    title: `${petName} 병원 전달 요약`,
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
