import type { User } from "@supabase/supabase-js";
import {
  analyzeLocally,
  type AiAccessStatus,
  type EpisodePlan,
  type HealthCheckInput,
  type HistoryRecord,
  type PetEpisode,
  type PetProfile,
  type VaccinationRecord,
  type VetReviewDraft,
} from "./health";

const petId = "store-preview-pet";
const episodeId = "store-preview-episode";

export const storePreviewEnabled =
  __DEV__ &&
  process.env.EXPO_PUBLIC_STORE_SCREENSHOT_MODE === "1";

export const storePreviewUser = {
  id: "store-preview-user",
  aud: "authenticated",
  role: "authenticated",
  email: "preview@petflow.app",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-27T00:00:00.000Z",
} as User;

export const storePreviewPet: PetProfile = {
  id: petId,
  name: "보리",
  species: "dog",
  breed: "말티즈",
  birthDate: "2021-04-12",
  sex: "spayed-female",
  weight: "4.2",
  photoPath: "",
  photoUrl: "",
};

export const storePreviewInput: HealthCheckInput = {
  petName: storePreviewPet.name,
  species: storePreviewPet.species,
  breed: storePreviewPet.breed,
  birthDate: storePreviewPet.birthDate,
  sex: storePreviewPet.sex,
  ageGroup: "adult",
  weight: storePreviewPet.weight,
  symptoms: ["itching"],
  appetite: "normal",
  energy: "slight",
  duration: "2-3days",
  redFlags: [],
  note: "저녁 산책 뒤 발을 자주 핥았어요.",
};

function previewRecord({
  id,
  createdAt,
  input,
}: {
  id: string;
  createdAt: string;
  input: HealthCheckInput;
}): HistoryRecord {
  return {
    petId,
    episodeId,
    input,
    result: {
      ...analyzeLocally(input),
      id,
      createdAt,
      source: "local",
      storage: "remote",
    },
  };
}

export const storePreviewHistory: HistoryRecord[] = [
  previewRecord({
    id: "store-preview-record-3",
    createdAt: "2026-07-27T08:40:00+09:00",
    input: storePreviewInput,
  }),
  previewRecord({
    id: "store-preview-record-2",
    createdAt: "2026-07-26T21:10:00+09:00",
    input: {
      ...storePreviewInput,
      energy: "normal",
      duration: "2-3days",
      note: "잠들기 전 오른쪽 앞발을 두 번 핥았어요.",
    },
  }),
  previewRecord({
    id: "store-preview-record-1",
    createdAt: "2026-07-24T19:30:00+09:00",
    input: {
      ...storePreviewInput,
      symptoms: ["itching", "eye"],
      energy: "normal",
      duration: "today",
      note: "산책 뒤 눈가가 평소보다 붉어 보여 사진을 남겼어요.",
    },
  }),
];

export const storePreviewEpisodes: PetEpisode[] = [
  {
    id: episodeId,
    petId,
    status: "open",
    startedAt: "2026-07-24T19:30:00+09:00",
    lastActivityAt: "2026-07-27T08:40:00+09:00",
    closedAt: null,
  },
];

export const storePreviewPlans: EpisodePlan[] = [
  {
    id: "store-preview-plan",
    episodeId,
    petId,
    sourceType: "owner",
    reviewStatus: "user_reported",
    reportedAt: "2026-07-25T12:00:00+09:00",
    tasks: [
      {
        id: "store-preview-task",
        text: "발을 핥는 횟수와 산책 시간을 함께 기록하기",
        position: 0,
        completedAt: null,
      },
    ],
  },
];

export const storePreviewVaccinations: VaccinationRecord[] = [
  {
    id: "store-preview-vaccination",
    petId,
    name: "종합 예방접종",
    administeredAt: "2025-08-05",
    dueAt: "2026-08-05",
    status: "scheduled",
    note: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

export const storePreviewAiAccess: AiAccessStatus = {
  enabled: true,
  reason: "active",
  availableCredits: 1,
  complimentaryCredits: 1,
  purchasedCredits: 0,
  usedTotal: 0,
  billingConfigured: true,
  purchaseAvailable: true,
  productId: "petflow_ai_summary_1",
};

export const storePreviewVetDrafts: Record<string, VetReviewDraft> = {
  [episodeId]: {
    title: "보리 병원 전달 요약",
    generatedAt: "2026-07-27T09:00:00+09:00",
    source: "openai",
    reviewStatus: "unreviewed",
    overview:
      "7월 24일부터 발 핥기와 가려움이 반복됐고, 27일에는 식욕은 평소와 같고 활력이 조금 줄었다고 기록했습니다.",
    handoffNote:
      "보호자가 남긴 3회의 관찰을 날짜순으로 정리한 AI 초안입니다.",
    keyObservations: [
      "7월 24일 산책 뒤 눈가가 평소보다 붉어 보였음",
      "7월 26일 잠들기 전 오른쪽 앞발을 두 번 핥았음",
      "7월 27일 식욕은 평소와 같고 활력은 조금 줄었음",
    ],
    timeline: [
      "7월 24일 · 눈가 변화와 발 핥기 기록",
      "7월 26일 · 오른쪽 앞발 핥기 반복",
      "7월 27일 · 활력 감소 기록",
    ],
    mediaSummary: ["보호자 첨부 사진 1개"],
    planAndProgress: ["발을 핥는 횟수와 산책 시간을 함께 기록 중"],
    questionsForVet: ["반복되는 발 핥기를 어떤 기준으로 관찰하면 좋을까요?"],
    submissionNote: "원문 기록과 함께 확인해 주세요.",
    disclaimer:
      "이 내용은 보호자 기록을 정리한 AI 초안이며 진단이나 수의사 확인 기록이 아닙니다.",
    copyText:
      "보리 병원 전달 요약\n7월 24일부터 발 핥기와 가려움이 반복됐습니다.",
  },
};
