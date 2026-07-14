import type { VaccinationRecord } from "./health";

export interface VaccinationDraft {
  id?: string;
  name: string;
  administeredAt: string;
  dueAt: string;
  note: string;
}

export interface VaccinationRow {
  id: string;
  pet_id: string;
  vaccine_name: string;
  administered_at: string | null;
  due_at: string | null;
  status: VaccinationRecord["status"];
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MobileVaccinationReminder {
  tone: "upcoming" | "due" | "overdue";
  label: string;
  title: string;
  description: string;
}

export const vaccinationSelectColumns =
  "id,pet_id,vaccine_name,administered_at,due_at,status,note,created_at,updated_at";

const dayMs = 24 * 60 * 60 * 1000;

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysUntilDate(dateText: string, today = new Date()) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round(
    (startOfLocalDay(date).getTime() - startOfLocalDay(today).getTime()) / dayMs,
  );
}

function nextVaccination(records: VaccinationRecord[], today = new Date()) {
  return records
    .filter((record) => record.status === "scheduled" && record.dueAt)
    .map((record) => ({
      record,
      daysUntil: daysUntilDate(record.dueAt as string, today),
    }))
    .filter((item): item is { record: VaccinationRecord; daysUntil: number } =>
      item.daysUntil !== null,
    )
    .sort((a, b) => a.daysUntil - b.daysUntil)[0];
}

export function isMissingVaccinationTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "42P01" ||
    maybeError.code === "PGRST205" ||
    Boolean(maybeError.message?.includes("pet_vaccinations"))
  );
}

export function toVaccinationRecord(row: VaccinationRow): VaccinationRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    name: row.vaccine_name,
    administeredAt: row.administered_at,
    dueAt: row.due_at,
    status: row.status,
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function hasVaccinationDraft(draft: VaccinationDraft) {
  return Boolean(
    draft.name.trim() ||
      draft.administeredAt.trim() ||
      draft.dueAt.trim() ||
      draft.note.trim(),
  );
}

export function vaccinationReminder(
  records: VaccinationRecord[],
  today = new Date(),
): MobileVaccinationReminder | null {
  const next = nextVaccination(records, today);
  if (!next) return null;
  if (next.daysUntil < 0) {
    return {
      tone: "overdue",
      label: "예정일 지남",
      title: `${next.record.name} 접종을 확인해 주세요`,
      description: `${Math.abs(next.daysUntil)}일 지났어요.`,
    };
  }
  if (next.daysUntil === 0) {
    return {
      tone: "due",
      label: "오늘 예정",
      title: `${next.record.name} 예정일이에요`,
      description: "병원 방문 여부를 확인해 주세요.",
    };
  }
  if (next.daysUntil <= 7) {
    return {
      tone: "due",
      label: `D-${next.daysUntil}`,
      title: `${next.record.name} 일정이 가까워요`,
      description: "이번 주 병원 일정을 확인해 주세요.",
    };
  }
  return {
    tone: "upcoming",
    label: `D-${next.daysUntil}`,
    title: `${next.record.name} 예정`,
    description: "가까워지면 다시 알려드릴게요.",
  };
}

export function vaccinationDraftFromRecords(
  records: VaccinationRecord[],
): VaccinationDraft {
  const record = nextVaccination(records)?.record ?? records[0];
  return {
    id: record?.id,
    name: record?.name ?? "",
    administeredAt: record?.administeredAt ?? "",
    dueAt: record?.dueAt ?? "",
    note: record?.note ?? "",
  };
}
