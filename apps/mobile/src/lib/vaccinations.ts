import type { VaccinationRecord } from "./health";

export interface VaccinationDraft {
  id?: string;
  name: string;
  administeredAt: string;
  dueAt: string;
  note: string;
}

export type VaccinationIntervalId = "4weeks" | "6months" | "1year" | "3years";

export const dogVaccinationOptions = [
  {
    id: "core",
    label: "종합백신",
    value: "종합백신",
    aliases: ["dhpp", "dhppl", "종합 예방접종"],
  },
  {
    id: "rabies",
    label: "광견병",
    value: "광견병",
    aliases: ["광견병백신", "광견병 백신"],
  },
  {
    id: "coronavirus",
    label: "코로나 장염",
    value: "코로나 장염",
    aliases: [
      "코로나장염",
      "코로나장염백신",
      "코로나 장염 백신",
      "개 코로나바이러스",
      "개 코로나바이러스 백신",
      "코로나바이러스백신(개)",
    ],
  },
  {
    id: "kennel-cough",
    label: "켄넬코프",
    value: "켄넬코프",
    aliases: ["켄넬코프백신", "켄넬코프 백신", "전염성기관지염"],
  },
  {
    id: "influenza",
    label: "개 인플루엔자",
    value: "개 인플루엔자",
    aliases: [
      "신종인플루엔자",
      "신종 인플루엔자",
      "신종플루",
      "인플루엔자백신",
      "개 인플루엔자 백신",
    ],
  },
] as const;

export const vaccinationIntervalOptions: Array<{
  id: VaccinationIntervalId;
  label: string;
}> = [
  { id: "4weeks", label: "4주 후" },
  { id: "6months", label: "6개월 후" },
  { id: "1year", label: "1년 후" },
  { id: "3years", label: "3년 후" },
];

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
  tone: "none" | "upcoming" | "due" | "overdue";
  label: string;
  title: string;
  description: string;
}

export const vaccinationSelectColumns =
  "id,pet_id,vaccine_name,administered_at,due_at,status,note,created_at,updated_at";

const dayMs = 24 * 60 * 60 * 1000;

function normalizedVaccinationName(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[\s()_-]/g, "");
}

function parsedDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? { year, month, day }
    : null;
}

function dateInput(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarMonths(value: string, months: number) {
  const parsed = parsedDateInput(value);
  if (!parsed) return "";
  const targetMonthIndex = parsed.month - 1 + months;
  const targetYear = parsed.year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return dateInput(targetYear, targetMonth + 1, Math.min(parsed.day, lastDay));
}

export function vaccinationOptionForName(value: string) {
  const normalized = normalizedVaccinationName(value);
  if (!normalized) return null;
  return (
    dogVaccinationOptions.find((option) =>
      [option.value, ...option.aliases].some(
        (candidate) => normalizedVaccinationName(candidate) === normalized,
      ),
    ) ?? null
  );
}

export function sameVaccinationName(left: string, right: string) {
  const leftOption = vaccinationOptionForName(left);
  const rightOption = vaccinationOptionForName(right);
  if (leftOption || rightOption) return leftOption?.id === rightOption?.id;
  return normalizedVaccinationName(left) === normalizedVaccinationName(right);
}

export function vaccinationDueAt(
  administeredAt: string,
  interval: VaccinationIntervalId,
) {
  if (interval === "4weeks") {
    const parsed = parsedDateInput(administeredAt);
    if (!parsed) return "";
    const date = new Date(parsed.year, parsed.month - 1, parsed.day + 28);
    return dateInput(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }
  if (interval === "6months") return addCalendarMonths(administeredAt, 6);
  if (interval === "1year") return addCalendarMonths(administeredAt, 12);
  return addCalendarMonths(administeredAt, 36);
}

export function vaccinationIntervalFromDates(
  administeredAt: string,
  dueAt: string,
): VaccinationIntervalId | null {
  return (
    vaccinationIntervalOptions.find(
      (option) => vaccinationDueAt(administeredAt, option.id) === dueAt,
    )?.id ?? null
  );
}

export function vaccinationDraftForNewEntry(name: string): VaccinationDraft {
  return {
    name,
    administeredAt: "",
    dueAt: "",
    note: "",
  };
}

export function formatVaccinationDate(value: string) {
  const parsed = parsedDateInput(value);
  return parsed
    ? `${parsed.year}.${String(parsed.month).padStart(2, "0")}.${String(parsed.day).padStart(2, "0")}`
    : value;
}

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

function latestVaccinationRecords(records: VaccinationRecord[]) {
  const latestBySeries = new Map<string, VaccinationRecord>();
  for (const record of records) {
    const seriesKey =
      vaccinationOptionForName(record.name)?.id ?? normalizedVaccinationName(record.name);
    const current = latestBySeries.get(seriesKey);
    if (!current) {
      latestBySeries.set(seriesKey, record);
      continue;
    }
    const recordDate = record.administeredAt ?? record.createdAt.slice(0, 10);
    const currentDate = current.administeredAt ?? current.createdAt.slice(0, 10);
    if (
      recordDate > currentDate ||
      (recordDate === currentDate && record.updatedAt > current.updatedAt)
    ) {
      latestBySeries.set(seriesKey, record);
    }
  }
  return [...latestBySeries.values()];
}

function nextVaccination(records: VaccinationRecord[], today = new Date()) {
  return latestVaccinationRecords(records)
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
  if (!next) {
    const latestDone = records
      .filter((record) => record.status === "done")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return latestDone
      ? {
          tone: "none",
          label: "일정 확인",
          title: `${latestDone.name} 다음 일정을 확인해 주세요`,
          description: "병원에서 확인한 주기를 선택하면 자동으로 계산해요.",
        }
      : null;
  }
  if (next.daysUntil < 0) {
    return {
      tone: "overdue",
      label: "예정일 지남",
      title: `${next.record.name} 병원 일정을 확인해 주세요`,
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
      description: "이번 주 일정을 확인해 주세요.",
    };
  }
  if (next.daysUntil <= 30) {
    return {
      tone: "upcoming",
      label: `${next.daysUntil}일 뒤`,
      title: `${next.record.name} 일정이 다가와요`,
      description: `${formatVaccinationDate(next.record.dueAt as string)} 예정이에요.`,
    };
  }
  return {
    tone: "none",
    label: "다음 일정",
    title: `${next.record.name} · ${formatVaccinationDate(next.record.dueAt as string)}`,
    description: "저장한 병원 안내 주기로 계산한 일정이에요.",
  };
}
