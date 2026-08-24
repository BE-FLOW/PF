import type {
  AnalysisResult,
  HealthCheckInput,
  PetProfile,
  RedFlagId,
  RiskLevel,
  SymptomId,
} from "./types";

export const symptomLabels: Record<SymptomId, string> = {
  vomiting: "구토",
  diarrhea: "설사",
  cough: "기침·호흡기 증상",
  itching: "가려움·피부 변화",
  limping: "절뚝거림",
  eye: "눈·귀 이상",
  urination: "배뇨 변화",
  pain: "통증 반응",
};

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
        ? `${symptomLabels[symptom]} (${details.join(", ")})`
        : symptomLabels[symptom];
    })
    .join(", ");
}

export const durationLabels: Record<HealthCheckInput["duration"], string> = {
  today: "오늘부터",
  "2-3days": "2~3일",
  "4-7days": "4~7일",
  "over-week": "1주 이상",
};

export const levelLabels: Record<HealthCheckInput["appetite"], string> = {
  normal: "평소와 같음",
  slight: "조금 줄었음",
  low: "많이 줄었음",
  none: "거의 없음",
};

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

export const ageGroupLabels: Record<HealthCheckInput["ageGroup"], string> = {
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

export function hasKnownValidBirthDate(
  value: string | undefined,
  now = new Date(),
) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    parsed.getTime() <= now.getTime()
  );
}

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
    symptomDetails: {},
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
        "증상과 컨디션 저하가 함께 기록됐습니다. 가능한 빠른 시일 안에 동물병원에 연락해 상담 시점을 정해 주세요.",
    };
  }
  return {
    headline: "지금은 차분히 관찰해도 좋아요",
    summary:
      "현재 기록만으로는 즉시 진료가 필요한 뚜렷한 위험 신호가 보이지 않습니다. 변화가 생기는지 같은 기준으로 꾸준히 관찰해 주세요.",
  };
}

export function analyzeLocally(input: HealthCheckInput): AnalysisResult {
  const inferredRedFlags = detectEmergencyRedFlags(input.note);
  const redFlags = [...new Set([...input.redFlags, ...inferredRedFlags])];
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
  score += redFlags.length > 0 ? 70 : 0;
  score = Math.min(100, Math.max(8, score));

  const riskLevel: RiskLevel =
    redFlags.length > 0 || score >= 70
      ? "urgent"
      : score >= 38
        ? "soon"
        : "watch";
  const copy = riskCopy(riskLevel);
  const symptomText = input.symptoms.length
    ? formatSymptomSummary(input)
    : "입력되지 않아 평가하지 않음";
  const profileLine = [
    input.species === "dog"
      ? "강아지"
      : input.species === "cat"
        ? "고양이"
        : "기타",
    input.breed,
    hasKnownValidBirthDate(input.birthDate)
      ? ageGroupLabels[input.ageGroup]
      : "",
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
  const unassessedFields = [
    input.symptoms.length ? "" : "주요 증상",
    input.appetite === "normal" ? "식욕" : "",
    input.energy === "normal" ? "활력" : "",
    input.duration === "today" ? "시작 시점" : "",
  ].filter(Boolean);
  const onlyUnassessedDefaults = !hasAssessableObservation(input);
  const unassessedDetail = unassessedFields.length
    ? `${unassessedFields.join("·")} 정보는 선택되지 않아 평가하지 않았어요.`
    : "";
  const summaryDetail = changedBits.length
    ? `${changedBits.join(" · ")}로 입력됐어요.${unassessedDetail ? ` ${unassessedDetail}` : ""}`
    : inferredRedFlags.length
      ? `보호자 메모에 즉시 확인이 필요한 표현이 입력됐어요. ${unassessedDetail}`
      : `${unassessedDetail} ${input.note.trim() ? "보호자 메모는 입력한 원문으로만 정리했어요." : "보호자 메모도 입력되지 않았어요."} 첨부 이미지가 있다면 그 내용도 판독하지 않았어요.`;
  const summary =
    onlyUnassessedDefaults
      ? summaryDetail
      : riskLevel === "urgent"
      ? `${summaryDetail} 위험 신호가 포함되어 있어 리포트를 더 읽기보다 병원에 먼저 연락하는 흐름이 맞아요.`
      : riskLevel === "soon"
        ? `${summaryDetail} 지금 바로 응급이라고 단정할 수는 없지만, 같은 상태가 이어지면 상담 일정을 잡아두는 편이 안전해요.`
        : `${summaryDetail} 큰 위험 신호는 보이지 않지만, 같은 기준으로 한 번 더 남기면 변화 흐름을 보기 쉬워요.`;

  const observations = [
    input.symptoms.length
      ? `선택한 증상: ${symptomText}`
      : "주요 증상: 입력되지 않아 평가하지 않음",
    input.duration !== "today"
      ? `이어진 기간: ${durationLabels[input.duration]}`
      : "시작 시점: 입력되지 않아 평가하지 않음",
    input.appetite !== "normal"
      ? `식욕: ${levelLabels[input.appetite]}`
      : "식욕: 입력되지 않아 평가하지 않음",
    input.energy !== "normal"
      ? `활력: ${levelLabels[input.energy]}`
      : "활력: 입력되지 않아 평가하지 않음",
    input.note.trim()
      ? "보호자 메모: 입력한 원문으로 저장"
      : "보호자 메모: 입력 없음",
    "첨부 사진·영상: PetFlow가 내용을 판독하지 않음",
  ];

  const actions =
    onlyUnassessedDefaults
      ? [
          "메모나 첨부 자료만으로 상태를 판단하지 마세요.",
          "호흡이 매우 힘들거나 쓰러짐·의식 소실·경련·멈추지 않는 출혈이 있으면 병원에 먼저 연락하세요.",
          "상태가 걱정되면 동물병원에 연락해 직접 확인을 받으세요.",
        ]
      : riskLevel === "urgent"
      ? [
          "이동 전에 동물병원에 전화해 위험 신호를 먼저 전달하세요.",
          "가능하면 증상이 시작된 시각과 변화를 메모해 함께 보여 주세요.",
          "사진·영상이 있다면 이동 중 새로 찍기보다 저장된 자료만 챙겨 보여 주세요.",
        ]
      : riskLevel === "soon"
        ? [
            "가능한 빠른 시일 안에 동물병원에 연락해 상담 시점을 확인하세요.",
            "상담 전 같은 기준으로 한 번 더 기록하면 변화 설명이 쉬워요.",
            "증상이 심해지거나 위험 신호가 생기면 바로 병원에 연락하세요.",
          ]
        : [
            "평소와 같은 기준으로 식욕, 활력, 배변·배뇨 상태의 변화를 다시 확인하세요.",
            "말로 설명하기 어려운 장면은 사진·영상으로 한 번만 남겨 두세요.",
            "증상이 이어지거나 새로운 변화가 생기면 병원 상담을 고려하세요.",
          ];

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    createdAt: new Date().toISOString(),
    riskLevel,
    riskScore: score,
    headline: onlyUnassessedDefaults
      ? "입력된 정보만 사실대로 정리했어요"
      : copy.headline,
    summary,
    observations,
    actions,
    vetBrief: `${input.petName || "반려동물"} / ${profileLine}\n증상: ${symptomText}\n기간: ${input.duration === "today" ? "입력되지 않아 평가하지 않음" : durationLabels[input.duration]}\n식욕: ${input.appetite === "normal" ? "입력되지 않아 평가하지 않음" : levelLabels[input.appetite]} / 활력: ${input.energy === "normal" ? "입력되지 않아 평가하지 않음" : levelLabels[input.energy]}${input.note.trim() ? `\n보호자 메모: ${input.note.trim()}` : ""}\n첨부 사진·영상: PetFlow 판독 안 함`,
    disclaimer,
    source: "local",
  };
}

export function isHealthCheckInput(value: unknown): value is HealthCheckInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<HealthCheckInput>;
  const symptoms = new Set<HealthCheckInput["symptoms"][number]>([
    "vomiting",
    "diarrhea",
    "cough",
    "itching",
    "limping",
    "eye",
    "urination",
    "pain",
  ]);
  const redFlags = new Set<HealthCheckInput["redFlags"][number]>([
    "breathing",
    "collapse",
    "seizure",
    "bleeding",
  ]);
  const hasValidUniqueValues = <T extends string>(
    items: unknown,
    allowed: Set<T>,
    maxItems: number,
  ): items is T[] =>
    Array.isArray(items) &&
    items.length <= maxItems &&
    items.every((item): item is T => typeof item === "string" && allowed.has(item as T)) &&
    new Set(items).size === items.length;
  const isIsoDate = (date: unknown): date is string => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return false;
    }
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };
  const hasValidSymptomDetails = (
    value: unknown,
    selectedSymptoms: unknown,
  ) => {
    if (value === undefined) return true;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Array.isArray(selectedSymptoms)
    ) {
      return false;
    }
    const selected = new Set(
      selectedSymptoms.filter((item): item is string => typeof item === "string"),
    );
    const entries = Object.entries(value);
    return (
      entries.length <= Object.keys(symptomDetailQuestions).length &&
      entries.every(([symptom, details]) => {
        const question = symptomDetailQuestions[symptom as SymptomId];
        if (!question || !selected.has(symptom)) return false;
        if (
          !Array.isArray(details) ||
          !hasValidUniqueValues(
            details,
            new Set(question.options.map((option) => option.id)),
            question.options.length,
          )
        ) {
          return false;
        }
        return (question.exclusiveGroups ?? []).every(
          (group) => group.filter((id) => details.includes(id)).length <= 1,
        );
      })
    );
  };

  return Boolean(
    typeof input.petName === "string" &&
    input.petName.trim().length >= 1 &&
    input.petName.trim().length <= 30 &&
    ["dog", "cat", "other"].includes(input.species ?? "") &&
    (input.breed === undefined ||
      (typeof input.breed === "string" && input.breed.length <= 80)) &&
    (input.birthDate === undefined ||
      isIsoDate(input.birthDate)) &&
    (input.sex === undefined ||
      ["unknown", "male", "female", "neutered-male", "spayed-female"].includes(
        input.sex,
      )) &&
    (input.weight === undefined ||
      (typeof input.weight === "string" && input.weight.length <= 20)) &&
    ["young", "adult", "senior"].includes(input.ageGroup ?? "") &&
    hasValidUniqueValues(input.symptoms, symptoms, symptoms.size) &&
    hasValidSymptomDetails(input.symptomDetails, input.symptoms) &&
    ["normal", "slight", "low", "none"].includes(input.appetite ?? "") &&
    ["normal", "slight", "low", "none"].includes(input.energy ?? "") &&
    ["today", "2-3days", "4-7days", "over-week"].includes(
      input.duration ?? "",
    ) &&
    hasValidUniqueValues(input.redFlags, redFlags, redFlags.size) &&
    typeof input.note === "string" &&
    input.note.length <= 1000,
  );
}
