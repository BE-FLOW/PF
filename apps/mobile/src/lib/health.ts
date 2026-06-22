export type Species = "dog" | "cat" | "other";
export type PetSex = "unknown" | "male" | "female" | "neutered-male" | "spayed-female";
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
}

export interface HistoryRecord {
  petId?: string;
  episodeId?: string;
  input: HealthCheckInput;
  result: AnalysisResult;
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
      description: "오늘 상태를 기록하면 작은 변화가 쌓이기 시작해요.",
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
              "같은 증상이나 컨디션 변화가 이어지는지 같은 기준으로 기록해 주세요.",
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
