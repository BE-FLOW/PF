import {
  isDateInputOnOrBefore,
  isValidDateInput,
  normalizeDateInput,
} from "./date-input";
import type { PetTestRecord } from "./health";

export const petTestRecordLimits = {
  testName: 120,
  resultText: 1000,
  clinicName: 120,
  memo: 1000,
} as const;

export interface PetTestRecordDraft {
  id?: string;
  episodeId?: string | null;
  testedAt: string;
  testName: string;
  resultText: string;
  clinicName: string;
  memo: string;
}

export interface PetTestRecordRow {
  id: string;
  pet_id: string;
  episode_id: string | null;
  tested_at: string;
  test_name: string;
  result_text: string;
  clinic_name: string | null;
  memo: string | null;
  source_type: PetTestRecord["sourceType"];
  review_status: PetTestRecord["reviewStatus"];
  created_at: string;
  updated_at: string;
}

export interface PetTestRecordMutation {
  user_id: string;
  pet_id: string;
  episode_id: string | null;
  tested_at: string;
  test_name: string;
  result_text: string;
  clinic_name: string | null;
  memo: string | null;
  source_type: "owner";
  review_status: "user_reported";
}

export const petTestRecordSelectColumns =
  "id,pet_id,episode_id,tested_at,test_name,result_text,clinic_name,memo,source_type,review_status,created_at,updated_at";

export function emptyPetTestRecordDraft(
  testedAt = "",
  episodeId: string | null = null,
): PetTestRecordDraft {
  return {
    episodeId,
    testedAt,
    testName: "",
    resultText: "",
    clinicName: "",
    memo: "",
  };
}

export function petTestRecordDraftFromRecord(
  record?: PetTestRecord,
): PetTestRecordDraft {
  if (!record) return emptyPetTestRecordDraft();
  return {
    id: record.id,
    episodeId: record.episodeId,
    testedAt: record.testedAt,
    testName: record.testName,
    resultText: record.resultText,
    clinicName: record.clinicName,
    memo: record.memo,
  };
}

export function hasPetTestRecordDraft(draft: PetTestRecordDraft) {
  return Boolean(
    draft.testedAt.trim() ||
      draft.testName.trim() ||
      draft.resultText.trim() ||
      draft.clinicName.trim() ||
      draft.memo.trim(),
  );
}

export function petTestRecordDraftError(
  draft: PetTestRecordDraft,
  today = new Date(),
) {
  const testedAt = normalizeDateInput(draft.testedAt.trim());
  const testName = draft.testName.trim();
  const resultText = draft.resultText.trim();
  const clinicName = draft.clinicName.trim();
  const memo = draft.memo.trim();

  if (!testedAt) return "검사 날짜를 입력해 주세요.";
  if (!isValidDateInput(testedAt)) return "검사 날짜를 확인해 주세요.";
  if (!isDateInputOnOrBefore(testedAt, today)) {
    return "검사 날짜는 오늘 또는 이전 날짜로 입력해 주세요.";
  }
  if (!testName) return "검사명을 입력해 주세요.";
  if (testName.length > petTestRecordLimits.testName) {
    return `검사명은 ${petTestRecordLimits.testName}자 이하로 입력해 주세요.`;
  }
  if (!resultText) return "검사 결과를 입력해 주세요.";
  if (resultText.length > petTestRecordLimits.resultText) {
    return `검사 결과는 ${petTestRecordLimits.resultText}자 이하로 입력해 주세요.`;
  }
  if (clinicName.length > petTestRecordLimits.clinicName) {
    return `병원명은 ${petTestRecordLimits.clinicName}자 이하로 입력해 주세요.`;
  }
  if (memo.length > petTestRecordLimits.memo) {
    return `메모는 ${petTestRecordLimits.memo}자 이하로 입력해 주세요.`;
  }
  return null;
}

export function petTestRecordMutation(
  draft: PetTestRecordDraft,
  userId: string,
  petId: string,
): PetTestRecordMutation {
  const clinicName = draft.clinicName.trim();
  const memo = draft.memo.trim();
  return {
    user_id: userId,
    pet_id: petId,
    episode_id: draft.episodeId ?? null,
    tested_at: normalizeDateInput(draft.testedAt.trim()),
    test_name: draft.testName.trim(),
    result_text: draft.resultText.trim(),
    clinic_name: clinicName || null,
    memo: memo || null,
    source_type: "owner",
    review_status: "user_reported",
  };
}

export function toPetTestRecord(row: PetTestRecordRow): PetTestRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    episodeId: row.episode_id,
    testedAt: row.tested_at,
    testName: row.test_name,
    resultText: row.result_text,
    clinicName: row.clinic_name ?? "",
    memo: row.memo ?? "",
    sourceType: row.source_type,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function sortPetTestRecordsNewestFirst(records: PetTestRecord[]) {
  return [...records].sort(
    (left, right) =>
      right.testedAt.localeCompare(left.testedAt) ||
      right.createdAt.localeCompare(left.createdAt),
  );
}

export function isMissingPetTestRecordsTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "42P01" ||
    maybeError.code === "PGRST205" ||
    Boolean(maybeError.message?.includes("pet_test_records"))
  );
}
