/*
 * PROTOTYPE — pure reading of a `RoutineState`. No React, no state, no mock: every surface shares these instead of
 * re-deriving the same rules. `routine-model.test.ts` is the only place the rules are asserted.
 */

import { addDays, type DayKey } from "@/features/habits/date";
import type {
  BlockStatus,
  DayWindow,
  RoutineBlock,
  RoutineOccurrence,
  RoutineState,
  Weekday,
} from "./types";

const MINUTES_PER_DAY = 24 * 60;

/** `"07:30"` is 450. Times are local wall-clock minutes; none of this ever converts through UTC. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function toTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Reads the weekday back from a local day key, using local noon so a DST edge cannot shift the day. */
export function weekdayOf(date: DayKey): Weekday {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12).getDay() as Weekday;
}

/** The waking window of one weekday: its own override, or the global default (S17). */
/** The server's inclusive edit window: today and the preceding `editWindowDays - 1` local dates remain writable. */
export function isFrozenDay(state: RoutineState, date: DayKey, today: DayKey): boolean {
  return date < addDays(today, -(state.settings.editWindowDays - 1));
}

export function windowOf(state: RoutineState, weekday: Weekday): DayWindow {
  return (
    state.settings.dayWindows[weekday] ?? { start: state.settings.dayStart, end: state.settings.dayEnd }
  );
}

/** The seven weekdays in the order the week is displayed, starting from the user's first day (S3). */
export function orderedWeekdays(weekStartsOn: Weekday): Weekday[] {
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => ((weekStartsOn + offset) % 7) as Weekday);
}

export function sortedBlocks(blocks: readonly RoutineBlock[]): RoutineBlock[] {
  return [...blocks].sort((left, right) => toMinutes(left.start) - toMinutes(right.start));
}

export function dayOf(state: RoutineState, weekday: Weekday): RoutineDayView {
  const day = state.days.find((candidate) => candidate.weekday === weekday);
  return { weekday, blocks: sortedBlocks(day?.blocks ?? []), isTemplate: day?.isTemplate ?? false };
}

type RoutineDayView = { weekday: Weekday; blocks: RoutineBlock[]; isTemplate: boolean };

export function blocksOf(state: RoutineState, weekday: Weekday): RoutineBlock[] {
  return dayOf(state, weekday).blocks;
}

export function blocksForDate(state: RoutineState, date: DayKey): RoutineBlock[] {
  return blocksOf(state, weekdayOf(date));
}

export function templateWeekday(state: RoutineState): Weekday | null {
  return state.days.find((day) => day.isTemplate)?.weekday ?? null;
}

/** The block that contains this minute, or `null` in a gap, a sleep band or outside the day. */
export function currentBlock(blocks: readonly RoutineBlock[], minute: number): RoutineBlock | null {
  return blocks.find((block) => toMinutes(block.start) <= minute && minute < toMinutes(block.end)) ?? null;
}

/** The first block that starts after this minute. */
export function nextBlock(blocks: readonly RoutineBlock[], minute: number): RoutineBlock | null {
  return blocks.find((block) => toMinutes(block.start) > minute) ?? null;
}

/** How far the day has moved through the given block, `0..1`. */
export function blockProgress(block: RoutineBlock, minute: number): number {
  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  if (end <= start) return 0;
  return Math.max(0, Math.min(1, (minute - start) / (end - start)));
}

export type DaySegment =
  | { kind: "sleep"; start: string; end: string }
  | { kind: "gap"; start: string; end: string }
  | { kind: "block"; start: string; end: string; block: RoutineBlock };

/**
 * The whole 24 hours of one weekday, cut into what it is: sleep outside the day window, gaps where nothing is
 * planned, and the blocks themselves. Every surface renders from this, so no two of them can disagree about the day.
 */
export function segmentsOfDay(state: RoutineState, weekday: Weekday): DaySegment[] {
  const window = windowOf(state, weekday);
  const windowStart = toMinutes(window.start);
  const windowEnd = toMinutes(window.end);
  const segments: DaySegment[] = [];

  const pushRegion = (from: number, to: number) => {
    let cursor = from;
    while (cursor < to) {
      if (cursor < windowStart) {
        const end = Math.min(to, windowStart);
        segments.push({ kind: "sleep", start: toTime(cursor), end: toTime(end) });
        cursor = end;
      } else if (cursor >= windowEnd) {
        segments.push({ kind: "sleep", start: toTime(cursor), end: toTime(to) });
        cursor = to;
      } else {
        const end = Math.min(to, windowEnd);
        segments.push({ kind: "gap", start: toTime(cursor), end: toTime(end) });
        cursor = end;
      }
    }
  };

  let cursor = 0;
  for (const block of blocksOf(state, weekday)) {
    pushRegion(cursor, toMinutes(block.start));
    segments.push({ kind: "block", start: block.start, end: block.end, block });
    cursor = Math.max(cursor, toMinutes(block.end));
  }
  pushRegion(cursor, MINUTES_PER_DAY);

  return segments;
}

export function occurrenceOf(
  state: RoutineState,
  blockId: string,
  date: DayKey,
): RoutineOccurrence | null {
  return state.occurrences.find((entry) => entry.blockId === blockId && entry.date === date) ?? null;
}

/**
 * The state of one block on one date (S7). A closed day with no record is a miss; today with no record is pending,
 * which is why today never counts against the user.
 */
export function statusOf(
  state: RoutineState,
  block: RoutineBlock,
  date: DayKey,
  today: DayKey,
): BlockStatus {
  const occurrence = occurrenceOf(state, block.id, date);
  // A row can exist only to carry a note while the state is still `pending`: it explains, it never excuses, so the
  // computed default still applies underneath it.
  if (occurrence !== null && occurrence.status !== "pending") return occurrence.status;
  return date < today ? "missed" : "pending";
}

export function noteOf(state: RoutineState, blockId: string, date: DayKey): string {
  return occurrenceOf(state, blockId, date)?.note ?? "";
}

export type DayTally = {
  done: number;
  /** Obligations that still count: `done` plus what was missed, without excused or skipped ones. */
  expected: number;
  missed: number;
  excused: number;
  pending: number;
  wants: number;
};

/**
 * One day's numbers, counting obligations only (S8). Today and the future are tallied as pending, so a day in
 * progress never shows as a failure.
 */
export function tallyOf(state: RoutineState, date: DayKey, today: DayKey): DayTally {
  const tally: DayTally = { done: 0, expected: 0, missed: 0, excused: 0, pending: 0, wants: 0 };

  for (const block of blocksForDate(state, date)) {
    if (block.intent === "want") {
      tally.wants += 1;
      continue;
    }

    const status = statusOf(state, block, date, today);
    if (status === "done") {
      tally.done += 1;
      tally.expected += 1;
    } else if (status === "missed") {
      tally.missed += 1;
      tally.expected += 1;
    } else if (status === "excused" || status === "skipped") {
      tally.excused += 1;
    } else {
      tally.pending += 1;
    }
  }

  return tally;
}

/** The seven dates of the week that contains `today`, in display order (S3). */
export function weekDates(weekStartsOn: Weekday, today: DayKey): DayKey[] {
  const offset = (weekdayOf(today) - weekStartsOn + 7) % 7;
  const first = addDays(today, -offset);
  return [0, 1, 2, 3, 4, 5, 6].map((step) => addDays(first, step));
}

export type WeekTally = { done: number; expected: number; closed: number; rate: number | null };

/** The weekly rate over closed days of the current week; `null` when no obligation has closed yet. */
export function weekTallyOf(state: RoutineState, today: DayKey): WeekTally {
  const dates = weekDates(state.settings.weekStartsOn, today);
  let done = 0;
  let expected = 0;
  let closed = 0;

  for (const date of dates) {
    if (date >= today) continue;
    closed += 1;
    const tally = tallyOf(state, date, today);
    done += tally.done;
    expected += tally.expected;
  }

  return { done, expected, closed, rate: expected === 0 ? null : Math.round((done / expected) * 100) };
}

/** Total planned minutes inside the day window, which is the honest answer to "how full is this day". */
export function plannedMinutes(state: RoutineState, weekday: Weekday): number {
  return blocksOf(state, weekday).reduce(
    (total, block) => total + (toMinutes(block.end) - toMinutes(block.start)),
    0,
  );
}
