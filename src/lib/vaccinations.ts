import type { VaccinationRecord } from "./types";

export interface VaccinationDraft {
  id?: string;
  name: string;
  administeredAt: string;
  dueAt: string;
  note: string;
}

export type VaccinationReminderTone = "none" | "upcoming" | "due" | "overdue";

export interface VaccinationReminder {
  record?: VaccinationRecord;
  tone: VaccinationReminderTone;
  label: string;
  title: string;
  description: string;
  daysUntil: number | null;
}

const dayMs = 24 * 60 * 60 * 1000;

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function daysUntilDate(dateText: string, today = new Date()) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round(
    (startOfLocalDay(date).getTime() - startOfLocalDay(today).getTime()) / dayMs,
  );
}

export function vaccinationReminder(
  records: VaccinationRecord[],
  today = new Date(),
): VaccinationReminder {
  const next = records
    .filter((record) => record.status === "scheduled" && record.dueAt)
    .map((record) => ({
      record,
      daysUntil: daysUntilDate(record.dueAt as string, today),
    }))
    .filter((item): item is { record: VaccinationRecord; daysUntil: number } =>
      item.daysUntil !== null,
    )
    .sort((a, b) => a.daysUntil - b.daysUntil)[0];

  if (!next) {
    const latestDone = records
      .filter((record) => record.status === "done")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return {
      record: latestDone,
      tone: "none",
      label: latestDone ? "접종 기록 있음" : "예방접종",
      title: latestDone
        ? `${latestDone.name} 접종 기록이 있어요`
        : "다음 예방접종 일정을 남겨둘 수 있어요",
      description: latestDone
        ? "다음 예정일을 알게 되면 같은 곳에 추가해 주세요."
        : "날짜가 다가오면 홈에서 조용히 알려드릴게요.",
      daysUntil: null,
    };
  }

  if (next.daysUntil < 0) {
    return {
      record: next.record,
      tone: "overdue",
      label: "예정일 지남",
      title: `${next.record.name} 접종일을 확인해 주세요`,
      description: `${Math.abs(next.daysUntil)}일 지났어요.`,
      daysUntil: next.daysUntil,
    };
  }

  if (next.daysUntil === 0) {
    return {
      record: next.record,
      tone: "due",
      label: "오늘 예정",
      title: `${next.record.name} 접종 예정일이에요`,
      description: "병원 방문 여부를 확인해 주세요.",
      daysUntil: next.daysUntil,
    };
  }

  if (next.daysUntil <= 7) {
    return {
      record: next.record,
      tone: "due",
      label: `D-${next.daysUntil}`,
      title: `${next.record.name} 일정이 가까워요`,
      description: "이번 주 일정을 확인해 주세요.",
      daysUntil: next.daysUntil,
    };
  }

  if (next.daysUntil <= 14) {
    return {
      record: next.record,
      tone: "upcoming",
      label: `D-${next.daysUntil}`,
      title: `${next.record.name} 예정`,
      description: "가까워지면 다시 알려드릴게요.",
      daysUntil: next.daysUntil,
    };
  }

  return {
    record: next.record,
    tone: "none",
    label: `D-${next.daysUntil}`,
    title: `${next.record.name} 예정`,
    description: "가까워지면 다시 알려드릴게요.",
    daysUntil: next.daysUntil,
  };
}

export function vaccinationDraftFromRecords(
  records: VaccinationRecord[],
): VaccinationDraft {
  const reminder = vaccinationReminder(records);
  const record = reminder.record ?? records[0];
  return {
    id: record?.id,
    name: record?.name ?? "",
    administeredAt: record?.administeredAt ?? "",
    dueAt: record?.dueAt ?? "",
    note: record?.note ?? "",
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
