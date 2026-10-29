/*
 * The single definition of "how much of this habit was done" for the whole feature: the matrix, the detail view
 * and the stats all read these functions, so a level means the same thing everywhere.
 *
 * Trackable fields are `check` and `number`. A `text` field is a note and never counts towards completion, because
 * a habit with an optional comment could otherwise never be complete.
 */

import { addDays, dayKeysBetween, type DayKey } from "./date";
import type { Habit, HabitEntry, HabitField } from "./habits-api";

/** `0` is an untouched day; `4` is every trackable field satisfied. */
export type DayLevel = 0 | 1 | 2 | 3 | 4;

export function isTrackable(field: HabitField): boolean {
  return field.kind === "check" || field.kind === "number";
}

function isSatisfied(field: HabitField, entry: HabitEntry | undefined): boolean {
  if (entry === undefined) return false;
  if (field.kind === "check") return entry.value === true;
  if (field.kind === "number") {
    if (typeof entry.value !== "number") return false;
    return field.target === null ? entry.value > 0 : entry.value >= field.target;
  }
  return false;
}

function levelOf(habit: Habit, fields: Map<string, HabitEntry>): DayLevel {
  const trackable = habit.fields.filter((field) => field.archivedAt === null && isTrackable(field));
  if (trackable.length === 0) {
    // A habit that only carries notes is done on any day it was written at all.
    return fields.size > 0 ? 4 : 0;
  }

  const satisfied = trackable.filter((field) => isSatisfied(field, fields.get(field.id))).length;
  if (satisfied === 0) return 0;

  return Math.min(4, Math.max(1, Math.round((satisfied / trackable.length) * 4))) as DayLevel;
}

/** Reads a day's entries once, so a year of levels does not rescan the whole list for every day. */
function levelReader(habit: Habit, entries: HabitEntry[]): (day: DayKey) => DayLevel {
  const byDay = new Map<DayKey, Map<string, HabitEntry>>();

  for (const entry of entries) {
    if (entry.habitId !== habit.id) continue;
    const fields = byDay.get(entry.date) ?? new Map<string, HabitEntry>();
    fields.set(entry.fieldId, entry);
    byDay.set(entry.date, fields);
  }

  return (day) => levelOf(habit, byDay.get(day) ?? new Map());
}

export function dayLevel(habit: Habit, day: DayKey, entries: HabitEntry[]): DayLevel {
  return levelReader(habit, entries)(day);
}

/**
 * Consecutive completed days ending today.
 *
 * An incomplete today does not break the run, because the day is not over yet; days before it do.
 */
export function currentStreak(habit: Habit, today: DayKey, entries: HabitEntry[]): number {
  const levelOn = levelReader(habit, entries);
  let streak = 0;
  let day = today;

  while (true) {
    if (levelOn(day) > 0) {
      streak += 1;
      day = addDays(day, -1);
      continue;
    }

    // Only today is allowed to be unfinished; the first missed earlier day ends the run.
    if (day === today) {
      day = addDays(day, -1);
      continue;
    }

    return streak;
  }
}

export function longestStreak(habit: Habit, from: DayKey, to: DayKey, entries: HabitEntry[]): number {
  const levelOn = levelReader(habit, entries);
  let longest = 0;
  let run = 0;

  for (const day of dayKeysBetween(from, to)) {
    if (levelOn(day) > 0) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  return longest;
}

/** Completed days over the days in the range, as a fraction. An empty range is zero. */
export function completionRate(habit: Habit, from: DayKey, to: DayKey, entries: HabitEntry[]): number {
  const days = dayKeysBetween(from, to);
  if (days.length === 0) return 0;

  const levelOn = levelReader(habit, entries);
  return days.filter((day) => levelOn(day) > 0).length / days.length;
}
