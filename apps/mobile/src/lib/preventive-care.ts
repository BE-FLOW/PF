import type {
  PreventiveCareCategory,
  PreventiveCareRecord,
} from "./health";
import {
  monthKeyFromDate,
  shiftRecordMonth,
  toRecordDateKey,
} from "./record-calendar";

export type PreventiveCareReminderTone = "complete" | "check-in";

export interface PreventiveCareDraft {
  category: PreventiveCareCategory;
  completedOn: string;
  note: string;
}

export interface PreventiveCareRow {
  id: string;
  pet_id: string;
  category: PreventiveCareCategory;
  completed_on: string;
  completed_month: string;
  note: string | null;
  source_type: "owner";
  review_status: "user_reported";
  created_at: string;
  updated_at: string;
}

export interface PreventiveCareUpsertPayload {
  user_id: string;
  pet_id: string;
  category: PreventiveCareCategory;
  completed_on: string;
  note: string;
  source_type: "owner";
  review_status: "user_reported";
  updated_at: string;
}

export interface PreventiveCareMonthlyStatus {
  category: PreventiveCareCategory;
  categoryLabel: string;
  state: "completed" | "check-in";
  currentMonth: string;
  completedThisMonth: boolean;
  completedOn: string | null;
  latestCompletedOn: string | null;
  nextCheckInMonth: string;
  nextCheckInOn: string;
  reminder: {
    tone: PreventiveCareReminderTone;
    label: string;
    title: string;
    description: string;
    actionLabel: string | null;
  };
}

export const preventiveCareOptions: ReadonlyArray<{
  id: PreventiveCareCategory;
  label: string;
}> = [
  { id: "heartworm", label: "심장사상충" },
  { id: "internal_external_parasite", label: "내·외부 기생충" },
];

export const preventiveCareSelectColumns =
  "id,pet_id,category,completed_on,completed_month,note,source_type,review_status,created_at,updated_at";

export const preventiveCareUpsertConflict =
  "pet_id,category,completed_month";

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toRecordDateKey(`${value}T12:00:00+09:00`) === value;
}

function careLabel(category: PreventiveCareCategory) {
  return (
    preventiveCareOptions.find((option) => option.id === category)?.label ??
    category
  );
}

function koreanShortDate(value: string) {
  if (!validDateKey(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function koreanMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${Number(match[1])}년 ${Number(match[2])}월`;
}

function orderedNewestFirst(records: PreventiveCareRecord[]) {
  return [...records].sort(
    (left, right) =>
      right.completedOn.localeCompare(left.completedOn) ||
      right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function preventiveCareCompletionForToday(
  category: PreventiveCareCategory,
  today = new Date(),
): PreventiveCareDraft {
  return {
    category,
    completedOn: toRecordDateKey(today),
    note: "",
  };
}

export function preventiveCareUpsertPayload(
  userId: string,
  petId: string,
  draft: PreventiveCareDraft,
  updatedAt = new Date(),
): PreventiveCareUpsertPayload {
  return {
    user_id: userId,
    pet_id: petId,
    category: draft.category,
    completed_on: draft.completedOn,
    note: draft.note.trim(),
    source_type: "owner",
    review_status: "user_reported",
    updated_at: updatedAt.toISOString(),
  };
}

export function toPreventiveCareRecord(
  row: PreventiveCareRow,
): PreventiveCareRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    category: row.category,
    completedOn: row.completed_on,
    completedMonth: row.completed_month,
    note: row.note ?? "",
    sourceType: row.source_type,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function latestPreventiveCareRecord(
  records: PreventiveCareRecord[],
  category: PreventiveCareCategory,
) {
  return orderedNewestFirst(
    records.filter(
      (record) => record.category === category && validDateKey(record.completedOn),
    ),
  )[0];
}

export function preventiveCareRecordForMonth(
  records: PreventiveCareRecord[],
  category: PreventiveCareCategory,
  month: string,
) {
  return orderedNewestFirst(
    records.filter(
      (record) =>
        record.category === category &&
        (record.completedMonth === `${month}-01` ||
          monthKeyFromDate(record.completedOn) === month),
    ),
  )[0];
}

export function preventiveCareMonthlyStatus(
  records: PreventiveCareRecord[],
  category: PreventiveCareCategory,
  today = new Date(),
): PreventiveCareMonthlyStatus {
  const currentDate = toRecordDateKey(today);
  const currentMonth = currentDate.slice(0, 7);
  const currentRecord = preventiveCareRecordForMonth(
    records,
    category,
    currentMonth,
  );
  const latestRecord = latestPreventiveCareRecord(records, category);
  const completedThisMonth = Boolean(currentRecord);
  const nextCheckInMonth = completedThisMonth
    ? shiftRecordMonth(currentMonth, 1)
    : currentMonth;
  const label = careLabel(category);

  return {
    category,
    categoryLabel: label,
    state: completedThisMonth ? "completed" : "check-in",
    currentMonth,
    completedThisMonth,
    completedOn: currentRecord?.completedOn ?? null,
    latestCompletedOn: latestRecord?.completedOn ?? null,
    nextCheckInMonth,
    nextCheckInOn: completedThisMonth
      ? `${nextCheckInMonth}-01`
      : currentDate,
    reminder: completedThisMonth
      ? {
          tone: "complete",
          label: "이번 달 기록 완료",
          title: `${label} 기록을 남겼어요`,
          description: `${koreanShortDate(currentRecord?.completedOn ?? "")}에 보호자가 했다고 기록했어요. 다음 월별 확인은 ${koreanMonth(nextCheckInMonth)}에 보여드려요.`,
          actionLabel: null,
        }
      : {
          tone: "check-in",
          label: "이번 달 확인",
          title: `${label}, 이번 달 했나요?`,
          description: "했다면 눌러 오늘 날짜로 기록할 수 있어요.",
          actionLabel: "오늘 날짜로 기록",
        },
  };
}

export function preventiveCareMonthlyStatuses(
  records: PreventiveCareRecord[],
  today = new Date(),
) {
  return preventiveCareOptions.map((option) =>
    preventiveCareMonthlyStatus(records, option.id, today),
  );
}

export function nextPreventiveCareCheckInOn(
  records: PreventiveCareRecord[],
  category: PreventiveCareCategory,
  today = new Date(),
) {
  return preventiveCareMonthlyStatus(records, category, today).nextCheckInOn;
}

export function mergePreventiveCareRecord(
  records: PreventiveCareRecord[],
  saved: PreventiveCareRecord,
) {
  const savedMonth = monthKeyFromDate(saved.completedOn);
  return orderedNewestFirst([
    saved,
    ...records.filter(
      (record) =>
        record.id !== saved.id &&
        !(
          record.petId === saved.petId &&
          record.category === saved.category &&
          monthKeyFromDate(record.completedOn) === savedMonth
        ),
    ),
  ]);
}

export function isMissingPreventiveCareTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "42P01" ||
    maybeError.code === "PGRST205" ||
    Boolean(maybeError.message?.includes("pet_preventive_care"))
  );
}
