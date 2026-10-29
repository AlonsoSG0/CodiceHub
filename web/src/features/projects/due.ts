import { addDays, parseDayKey, todayKey } from "@/features/habits/date";

/**
 * Due dates are calendar days, never instants.
 *
 * The helpers of the habits section already own that arithmetic, so they are reused instead of being
 * written again: a day key is `YYYY-MM-DD` built from the browser's local calendar, and `toISOString()`
 * must never appear near one of them.
 */

/** The short label a due date carries on a card: "Today", "Tomorrow", "Yesterday" or "Oct 20". */
export function dueLabel(
  dueDate: string,
  locale: string,
  labels: { today: string; tomorrow: string; yesterday: string },
  today: string = todayKey(),
): string {
  if (dueDate === today) return labels.today;
  if (dueDate === addDays(today, 1)) return labels.tomorrow;
  if (dueDate === addDays(today, -1)) return labels.yesterday;

  const { year, month, day } = parseDayKey(dueDate);
  // Noon rather than midnight: a daylight-saving transition can make local midnight not exist at all.
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
    new Date(year, month - 1, day, 12),
  );
}

/** A task is overdue when its day is behind today and nothing has finished it yet. */
export function isOverdue(dueDate: string, isCompleted: boolean, today: string = todayKey()): boolean {
  return !isCompleted && dueDate < today;
}
