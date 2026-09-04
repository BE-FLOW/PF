const compactDatePattern = /^\d{8}$/;
const formattedDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Keeps a date TextInput numeric while progressively adding ISO-style separators.
 * Both already-formatted values and compact YYYYMMDD values normalize to YYYY-MM-DD.
 */
export function normalizeDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function dateParts(value: string) {
  const normalized = compactDatePattern.test(value)
    ? normalizeDateInput(value)
    : value;
  const match = formattedDatePattern.exec(normalized);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Accepts complete YYYYMMDD or YYYY-MM-DD values and checks the calendar date. */
export function isValidDateInput(value: string) {
  const parts = dateParts(value);
  if (!parts || parts.year < 1 || parts.month < 1 || parts.month > 12) {
    return false;
  }

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);

  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day
  );
}

/** Checks a valid date input against a local calendar-day upper bound. */
export function isDateInputOnOrBefore(value: string, latest = new Date()) {
  if (!isValidDateInput(value)) return false;
  const normalized = normalizeDateInput(value);
  const latestDate = [
    String(latest.getFullYear()).padStart(4, "0"),
    String(latest.getMonth() + 1).padStart(2, "0"),
    String(latest.getDate()).padStart(2, "0"),
  ].join("-");
  return normalized <= latestDate;
}
