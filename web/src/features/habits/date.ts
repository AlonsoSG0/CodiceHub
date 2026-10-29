/*
 * Local calendar days for the habits section.
 *
 * A day is the string `YYYY-MM-DD` built from the browser's local calendar, and the server stores it as given.
 * `toISOString().slice(0, 10)` must never appear here: it reports the UTC day, which is the previous or the next
 * day for every user whose offset is not zero, and that silently corrupts both the heatmap and every streak.
 */

/** A local calendar day, `YYYY-MM-DD`. */
export type DayKey = string;
/** A local calendar month, `YYYY-MM`. */
export type MonthKey = string;

const dayKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const monthKeyPattern = /^(\d{4})-(\d{2})$/;

export type DayParts = { year: number; month: number; day: number };

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** Parses a day key, refusing both a malformed shape and a day the calendar does not have. */
export function parseDayKey(key: string): DayParts {
  const match = dayKeyPattern.exec(key);
  if (!match) throw new RangeError(`not a day key: ${key}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Round-trip through the local calendar so `2026-02-30` and `2026-13-01` are refused rather than normalized.
  const probe = new Date(year, month - 1, day, 12);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    throw new RangeError(`not a calendar day: ${key}`);
  }

  return { year, month, day };
}

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== "string") return false;
  try {
    parseDayKey(value);
    return true;
  } catch {
    return false;
  }
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const match = monthKeyPattern.exec(key);
  if (!match) throw new RangeError(`not a month key: ${key}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new RangeError(`not a calendar month: ${key}`);

  return { year, month };
}

/** The local calendar day an instant falls on. */
export function dayKeyOf(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): DayKey {
  return dayKeyOf(now);
}

export function monthKeyOf(key: DayKey): MonthKey {
  parseDayKey(key);
  return key.slice(0, 7);
}

export function addDays(key: DayKey, amount: number): DayKey {
  const { year, month, day } = parseDayKey(key);
  // Noon rather than midnight: a daylight-saving transition can make local midnight not exist at all,
  // and the calendar arithmetic must not slide onto a neighbouring day because of it.
  return dayKeyOf(new Date(year, month - 1, day + amount, 12));
}

/** Every day from `from` to `to` inclusive, ascending. An inverted range yields nothing. */
export function dayKeysBetween(from: DayKey, to: DayKey): DayKey[] {
  const keys: DayKey[] = [];
  let key = from;
  // Fixed-width keys compare as calendar order, so a string comparison is the range test.
  while (key <= to) {
    keys.push(key);
    key = addDays(key, 1);
  }
  return keys;
}

/** The Monday that starts the week containing `key`. */
export function weekStartKey(key: DayKey): DayKey {
  const { year, month, day } = parseDayKey(key);
  const offset = (new Date(year, month - 1, day, 12).getDay() + 6) % 7;
  return addDays(key, -offset);
}

/** Groups an ascending, contiguous list of days into whole weeks keyed by their Monday. */
export function weekBuckets(days: DayKey[]): Array<{ key: DayKey; days: DayKey[] }> {
  const buckets: Array<{ key: DayKey; days: DayKey[] }> = [];

  for (const day of days) {
    const key = weekStartKey(day);
    const last = buckets.at(-1);
    if (last?.key === key) last.days.push(day);
    else buckets.push({ key, days: [day] });
  }

  return buckets;
}

export function daysInMonth(month: MonthKey): DayKey[] {
  const bounds = monthBounds(month);
  return dayKeysBetween(bounds.from, bounds.to);
}

export function monthBounds(month: MonthKey): { from: DayKey; to: DayKey } {
  const { year, month: monthNumber } = parseMonthKey(month);
  // Day zero of the following month is the last day of this one, leap years included.
  const last = new Date(year, monthNumber, 0, 12).getDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

export function shiftMonth(month: MonthKey, amount: number): MonthKey {
  const { year, month: monthNumber } = parseMonthKey(month);
  const probe = new Date(year, monthNumber - 1 + amount, 1, 12);
  return `${pad(probe.getFullYear(), 4)}-${pad(probe.getMonth() + 1)}`;
}
