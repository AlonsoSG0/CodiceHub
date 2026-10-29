/** Local calendar days only: a check belongs to the day it was written, in the user's own timezone. */
export type DayKey = string;

export function dayKeyOf(instant: string | Date): DayKey {
  const date = instant instanceof Date ? instant : new Date(instant);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKey(): DayKey {
  return dayKeyOf(new Date());
}

export function shiftDay(key: DayKey, delta: number): DayKey {
  // Noon keeps the arithmetic away from daylight-saving edges.
  const date = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12);
  date.setDate(date.getDate() + delta);
  return dayKeyOf(date);
}

export function dayLabel(key: DayKey, today: DayKey, locale: string, labels: { today: string; yesterday: string }): string {
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" });
  if (key === today) return `${labels.today} · ${weekdayFormat.format(localNoon(key))}`;
  if (key === shiftDay(today, -1)) return `${labels.yesterday} · ${weekdayFormat.format(localNoon(key))}`;
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  const format = new Intl.DateTimeFormat(locale, sameYear
    ? { weekday: "short", month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" });
  return format.format(localNoon(key));
}

function localNoon(key: DayKey): Date {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12);
}

/** A date column wants the shortest unambiguous form, with its locale supplied by the caller. */
export function shortDayLabel(key: DayKey, today: DayKey, locale: string): string {
  const options: Intl.DateTimeFormatOptions = key.slice(0, 4) === today.slice(0, 4)
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat(locale, options).format(localNoon(key));
}
