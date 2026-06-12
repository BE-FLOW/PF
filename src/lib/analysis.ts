import type {
  AnalysisResult,
  HealthCheckInput,
  PetProfile,
  RiskLevel,
  SymptomId,
} from "./types";

const symptomLabels: Record<SymptomId, string> = {
  vomiting: "구토",
  diarrhea: "설사",
  cough: "기침·호흡기 증상",
  itching: "가려움·피부 변화",
  limping: "절뚝거림",
  eye: "눈·귀 이상",
  urination: "배뇨 변화",
  pain: "통증 반응",
};

const durationLabels: Record<HealthCheckInput["duration"], string> = {
  today: "오늘부터",
  "2-3days": "2~3일",
  "4-7days": "4~7일",
  "over-week": "1주 이상",
};

const levelLabels: Record<HealthCheckInput["appetite"], string> = {
  normal: "평소와 같음",
  slight: "조금 줄었음",
  low: "많이 줄었음",
  none: "거의 없음",
};

const ageGroupLabels: Record<HealthCheckInput["ageGroup"], string> = {
  young: "어린 반려동물",
  adult: "성견·성묘",
  senior: "노령 반려동물",
};

const levelScore: Record<HealthCheckInput["appetite"], number> = {
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
    weight: profile.weight,
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
    input.species === "dog"
      ? "강아지"
      : input.species === "cat"
        ? "고양이"
        : "기타",
    input.breed,
    ageGroupLabels[input.ageGroup],
    input.weight,
  ]
    .filter(Boolean)
    .join(" · ");

  const observations = [
    `주요 기록: ${symptomText}`,
    `지속 기간: ${durationLabels[input.duration]}`,
    input.appetite === "normal"
      ? "식욕은 평소와 비슷해요."
      : "식욕 변화가 기록되었어요.",
    input.energy === "normal"
      ? "활력은 평소와 비슷해요."
      : "활력 저하가 기록되었어요.",
  ];

  const actions =
    riskLevel === "urgent"
      ? [
          "이동 전에 동물병원에 전화해 위험 신호를 먼저 전달하세요.",
          "가능하면 증상이 시작된 시각과 변화를 메모해 함께 보여 주세요.",
          "임의로 사람용 약이나 남은 처방약을 먹이지 마세요.",
        ]
      : riskLevel === "soon"
        ? [
            "24시간 안에 동물병원 또는 수의사 상담을 예약해 보세요.",
            "음수량, 식사량, 배변·배뇨 횟수의 변화를 기록하세요.",
            "증상이 심해지거나 위험 신호가 생기면 바로 병원에 연락하세요.",
          ]
        : [
            "6~12시간 간격으로 식욕, 활력, 배변·배뇨 상태를 다시 확인하세요.",
            "증상 사진이나 영상이 가능하면 안전한 범위에서 남겨 두세요.",
            "증상이 이어지거나 새로운 변화가 생기면 병원 상담을 고려하세요.",
          ];

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    createdAt: new Date().toISOString(),
    riskLevel,
    riskScore: score,
    headline: copy.headline,
    summary: copy.summary,
    observations,
    actions,
    vetBrief: `${input.petName || "반려동물"} / ${profileLine}\n증상: ${symptomText}\n기간: ${durationLabels[input.duration]}\n식욕: ${levelLabels[input.appetite]} / 활력: ${levelLabels[input.energy]}${input.note ? `\n보호자 메모: ${input.note}` : ""}`,
    disclaimer,
    source: "local",
  };
}

export function isHealthCheckInput(value: unknown): value is HealthCheckInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<HealthCheckInput>;
  return Boolean(
    typeof input.petName === "string" &&
    input.petName.trim().length <= 30 &&
    ["dog", "cat", "other"].includes(input.species ?? "") &&
    (input.breed === undefined || typeof input.breed === "string") &&
    (input.birthDate === undefined || typeof input.birthDate === "string") &&
    (input.sex === undefined ||
      ["unknown", "male", "female", "neutered-male", "spayed-female"].includes(
        input.sex,
      )) &&
    ["young", "adult", "senior"].includes(input.ageGroup ?? "") &&
    Array.isArray(input.symptoms) &&
    ["normal", "slight", "low", "none"].includes(input.appetite ?? "") &&
    ["normal", "slight", "low", "none"].includes(input.energy ?? "") &&
    ["today", "2-3days", "4-7days", "over-week"].includes(
      input.duration ?? "",
    ) &&
    Array.isArray(input.redFlags) &&
    typeof input.note === "string" &&
    input.note.length <= 1000,
  );
}
