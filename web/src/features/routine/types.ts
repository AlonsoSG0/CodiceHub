/*
 * PROTOTYPE — the Routine module's view over mocked data.
 *
 * The question this wave answers: does a day built from time blocks, repeated across the week and marked from the
 * guide, hold up as the module? Spec: `odd/tasks/routine.md` (S1-S13). Everything below describes data; nothing here
 * touches a server, a preference key or a migration.
 */

import type { DayKey } from "@/features/habits/date";

/** JavaScript weekday numbering: 0 is Sunday, 6 is Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** `must` is scored, `want` is not: the weekly rate only ever counts obligations (S8). */
export type BlockIntent = "must" | "want";

export type MirrorTarget = "habit" | "task" | "goal";

/** A block may point at nothing at all; most of a day usually does (S4). */
export type BlockLink = { kind: MirrorTarget; id: string };

export type BlockStatus = "pending" | "done" | "missed" | "excused" | "skipped";

export type RoutineBlock = {
  id: string;
  title: string;
  /** Local `HH:MM`, inclusive. */
  start: string;
  /** Local `HH:MM`, exclusive. */
  end: string;
  intent: BlockIntent;
  link: BlockLink | null;
  note: string;
};

export type RoutineDay = {
  weekday: Weekday;
  blocks: RoutineBlock[];
  /** The reference day the rest of the week was repeated from (S5). */
  isTemplate: boolean;
};

/** A day's waking window. The global one is the default; a weekday may override it (S17). */
export type DayWindow = { start: string; end: string };

export type RoutineSettings = {
  weekStartsOn: Weekday;
  /** First hour that is not sleep. */
  dayStart: string;
  /** First hour that is sleep again. */
  dayEnd: string;
  /** Per-weekday overrides; a weekday without an entry follows the global window. */
  dayWindows: Partial<Record<Weekday, DayWindow>>;
  /** Number of recent calendar days that remain editable. */
  editWindowDays: 3 | 7;
};

/** One record per block and local date. The routine owns it; a link only ever mirrors it (S9). */
export type RoutineOccurrence = {
  blockId: string;
  date: DayKey;
  status: BlockStatus;
  note: string;
};

export type RoutineState = {
  settings: RoutineSettings;
  days: RoutineDay[];
  occurrences: RoutineOccurrence[];
};

/** What the mock wrote into the linked module, and whether it could (S9). */
export type LinkedMirror = {
  blockId: string;
  date: DayKey;
  target: MirrorTarget;
  targetId: string;
  written: boolean;
  /** Why the mirror could not be written, when it could not. */
  reason: "target_missing" | "no_completed_column" | "mirror_failed" | null;
};

export type BlockInput = {
  title: string;
  start: string;
  end: string;
  intent?: BlockIntent;
  link?: BlockLink | null;
  note?: string;
};

export type BlockPatch = Partial<BlockInput>;

/** Stand-ins for the real habit, task and goal lists the section will read one day. */
export type LinkTargets = {
  habits: Array<{ id: string; name: string; fieldId: string }>;
  tasks: Array<{ id: string; title: string; projectName: string }>;
  goals: Array<{ id: string; title: string }>;
};

export type MockHabit = { id: string; name: string };
export type MockTask = { id: string; title: string; project: string; hasCompletedColumn?: boolean };
export type MockGoal = { id: string; title: string };
