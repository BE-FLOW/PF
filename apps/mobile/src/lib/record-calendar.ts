export interface RecordCalendarDay {
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
}

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const koreanDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function partsToDateKey(parts: Intl.DateTimeFormatPart[]) {
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function parseMonthKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

function utcDateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function toRecordDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return partsToDateKey(koreanDateFormatter.formatToParts(date));
}

export function monthKeyFromDate(value: string | Date) {
  return toRecordDateKey(value).slice(0, 7);
}

export function recordDateKeyToIso(dateKey: string, now = new Date()) {
  const todayKey = toRecordDateKey(now);
  if (!dateKeyPattern.test(dateKey) || !todayKey || dateKey > todayKey) return null;

  const observedAt = new Date(`${dateKey}T12:00:00+09:00`);
  if (
    Number.isNaN(observedAt.getTime()) ||
    toRecordDateKey(observedAt) !== dateKey
  ) {
    return null;
  }

  return dateKey === todayKey ? now.toISOString() : observedAt.toISOString();
}

export function shiftRecordMonth(monthKey: string, amount: number) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1 + amount, 1));
  return utcDateKey(date).slice(0, 7);
}

export function buildRecordCalendar(monthKey: string): RecordCalendarDay[] {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return [];
  const first = new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      dateKey: utcDateKey(date),
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === parsed.month - 1,
    };
  });
}

export function normalizeRecordDateRange(first: string, second: string) {
  if (!dateKeyPattern.test(first) || !dateKeyPattern.test(second)) {
    return { start: first, end: second };
  }
  return first <= second
    ? { start: first, end: second }
    : { start: second, end: first };
}

export function isRecordDateInRange(
  dateKey: string,
  start: string,
  end: string | null,
) {
  if (!start) return false;
  const rangeEnd = end || start;
  return dateKey >= start && dateKey <= rangeEnd;
}
