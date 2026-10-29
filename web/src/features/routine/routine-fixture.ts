/* Test-only fixture: an in-memory fake of the Routine API for exercising the real fetch client in tests. */

import { addDays, todayKey, type DayKey } from "@/features/habits/date";
import { toMinutes, weekdayOf, windowOf } from "./routine-model";
import type {
  BlockInput,
  BlockPatch,
  BlockStatus,
  DayWindow,
  LinkedMirror,
  LinkTargets,
  MockGoal,
  MockHabit,
  MockTask,
  RoutineBlock,
  RoutineDay,
  RoutineOccurrence,
  RoutineSettings,
  RoutineState,
  Weekday,
} from "./types";
import { WEEKDAYS } from "./types";

// The fixture supplies options to tests; the production builder loads real habit, task and goal targets from the workspace.
export const mockHabits: MockHabit[] = [
  { id: "habit-read", name: "Read" },
  { id: "habit-train", name: "Train" },
  { id: "habit-journal", name: "Journal" },
];

export const mockTasks: MockTask[] = [
  { id: "task-proposal", title: "Finish the proposal", project: "Chub" },
  { id: "task-review", title: "Review the migration", project: "Chub" },
  { id: "task-invoices", title: "Pay the invoices", project: "Home", hasCompletedColumn: false },
];

export const mockGoals: MockGoal[] = [
  { id: "goal-ship", title: "Ship the routine module" },
  { id: "goal-read", title: "Read twelve books" },
];

/**
 * A target the user already deleted or archived. Blocks may still point at it: the routine keeps its own record and
 * the mirror reports that it could not be written (S9).
 */
export const deletedTargetIds: readonly string[] = ["habit-stretch", "task-deleted"];

export class RoutineError extends Error {
  constructor(
    readonly code: "block_not_found" | "block_overlap" | "outside_day_window" | "invalid_time" | "date_frozen", 
    message: string,
  ) {
    super(message);
    this.name = "RoutineError";
  }
}

export type RoutineSnapshot = { state: RoutineState; mirrors: LinkedMirror[] };

const defaultSettings: RoutineSettings = { weekStartsOn: 1, dayStart: "07:00", dayEnd: "23:00", dayWindows: {}, editWindowDays: 7 };

/** The day the user builds first, then repeats across the week. */
const templateDay: BlockInput[] = [
  { title: "Stretch", start: "07:00", end: "07:15", intent: "want", link: { kind: "habit", id: "habit-stretch" } },
  { title: "Wake up and breakfast", start: "07:15", end: "08:00" },
  { title: "Read", start: "08:00", end: "08:30", link: { kind: "habit", id: "habit-read" }, note: "Twenty minutes, no phone" },
  { title: "Deep work", start: "08:30", end: "12:00" },
  { title: "Lunch", start: "12:00", end: "13:00", intent: "want" },
  { title: "Proposal", start: "13:00", end: "17:00", link: { kind: "task", id: "task-proposal" } },
  { title: "Gym", start: "17:00", end: "18:00", link: { kind: "habit", id: "habit-train" } },
  { title: "Free time", start: "18:00", end: "19:00", intent: "want" },
  { title: "Dinner", start: "19:00", end: "20:00" },
  { title: "Journal", start: "20:00", end: "20:30", intent: "want", link: { kind: "habit", id: "habit-journal" } },
  { title: "Wind down", start: "20:30", end: "23:00", intent: "want" },
];

/** Wednesday: the gym moves out and the dentist moves in, which is exactly the per-day deviation the user asked for. */
const wednesdayDay: BlockInput[] = [
  { title: "Stretch", start: "07:00", end: "07:15", intent: "want" },
  { title: "Wake up and breakfast", start: "07:15", end: "08:00" },
  { title: "Read", start: "08:00", end: "08:30", link: { kind: "habit", id: "habit-read" } },
  { title: "Deep work", start: "08:30", end: "12:00" },
  { title: "Lunch", start: "12:00", end: "13:00", intent: "want" },
  { title: "Review the migration", start: "13:00", end: "16:00", link: { kind: "task", id: "task-review" } },
  { title: "Dentist", start: "16:00", end: "17:00" },
  { title: "Dinner", start: "19:00", end: "20:00" },
  { title: "Wind down", start: "20:30", end: "23:00", intent: "want" },
];

const weekendDay: BlockInput[] = [
  { title: "Slow breakfast", start: "09:00", end: "10:00", intent: "want" },
  { title: "Long run", start: "10:00", end: "12:00", intent: "want", link: { kind: "habit", id: "habit-train" } },
  { title: "Lunch", start: "12:30", end: "13:30", intent: "want" },
  { title: "Side project", start: "15:00", end: "17:00", link: { kind: "goal", id: "goal-ship" } },
  { title: "Dinner", start: "19:00", end: "20:00" },
  { title: "Read", start: "20:00", end: "22:00", intent: "want", link: { kind: "habit", id: "habit-read" } },
];

function materialize(weekday: Weekday, inputs: readonly BlockInput[]): RoutineBlock[] {
  return inputs.map((input, index) => ({
    id: `${weekday}-${index}`,
    title: input.title,
    start: input.start,
    end: input.end,
    intent: input.intent ?? "must",
    link: input.link ?? null,
    note: input.note ?? "",
  }));
}

function seedDays(): RoutineDay[] {
  return WEEKDAYS.map((weekday) => {
    if (weekday === 1) return { weekday, blocks: materialize(weekday, templateDay), isTemplate: true };
    if (weekday === 3) return { weekday, blocks: materialize(weekday, wednesdayDay), isTemplate: false };
    if (weekday === 0 || weekday === 6) return { weekday, blocks: materialize(weekday, weekendDay), isTemplate: false };
    return { weekday, blocks: materialize(weekday, templateDay), isTemplate: false };
  });
}

function seedState(): RoutineState {
  return { settings: { ...defaultSettings }, days: seedDays(), occurrences: [] };
}

/**
 * Two closed days of history, so the weekly rate has something to say on first load: the day before yesterday is
 * clean, yesterday misses the proposal and excuses the gym, and the stretch habit is gone so its mirror cannot write.
 */
function seedMirrors(seeded: RoutineState, today: DayKey): LinkedMirror[] {
  const written: LinkedMirror[] = [];
  const occurrences: RoutineOccurrence[] = [];

  const closed = [addDays(today, -1), addDays(today, -2)];
  for (const [index, date] of closed.entries()) {
    const blocks = seeded.days.find((day) => day.weekday === weekdayOf(date))?.blocks ?? [];
    // Yesterday misses one block on purpose, and it is a block with no link so the miss does not drag a mirror with
    // it. The gym is excused instead, because the demo needs one state that leaves the denominator alone.
    const obligations = blocks.filter((block) => block.intent === "must");
    const missedBlock = index === 0 ? (obligations[2] ?? obligations.at(-1)) : undefined;

    for (const block of blocks) {
      if (block.intent !== "must") continue;

      let status: BlockStatus = "done";
      if (block === missedBlock) status = "missed";
      if (index === 0 && block.link?.kind === "habit" && block.link.id === "habit-train") status = "excused";

      occurrences.push({ blockId: block.id, date, status, note: status === "excused" ? "Gym was closed" : "" });
      if (block.link !== null) {
        const missing = deletedTargetIds.includes(block.link.id);
        written.push({
          blockId: block.id,
          date,
          target: block.link.kind,
          targetId: block.link.id,
          written: !missing && status === "done",
          reason: missing ? "target_missing" : null,
        });
      }
    }
  }

  seeded.occurrences = occurrences;
  return written;
}

/*
 * The prototype's two pieces of module state are seeded here, after every constant and helper they read. Seeding them
 * above `defaultSettings` was a temporal-dead-zone crash that no typecheck could see.
 */
let state: RoutineState = seedState();
let fixtureToday = todayKey();
let mirrors: LinkedMirror[] = seedMirrors(state, fixtureToday);

function snapshot(): RoutineSnapshot {
  return { state, mirrors };
}

function findDay(weekday: Weekday): RoutineDay {
  const day = state.days.find((candidate) => candidate.weekday === weekday);
  if (day === undefined) throw new Error(`routine day ${weekday} is missing`);
  return day;
}

function findBlock(blockId: string): { day: RoutineDay; block: RoutineBlock } {
  for (const day of state.days) {
    const block = day.blocks.find((candidate) => candidate.id === blockId);
    if (block !== undefined) return { day, block };
  }
  throw new RoutineError("block_not_found", `no block ${blockId}`);
}

function assertTime(time: string): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new RoutineError("invalid_time", `not a time: ${time}`);
}

/** A block lives inside the waking window, and it has a direction (S2, S3). */
/** A block lives inside its own day's waking window, and it has a direction (S2, S3, S17). */
function assertPlacement(weekday: Weekday, candidate: { start: string; end: string }): void {
  assertTime(candidate.start);
  assertTime(candidate.end);
  if (toMinutes(candidate.end) <= toMinutes(candidate.start)) {
    throw new RoutineError("outside_day_window", "A block has to end after it starts.");
  }
  const window = windowOf(state, weekday);
  if (toMinutes(candidate.start) < toMinutes(window.start) || toMinutes(candidate.end) > toMinutes(window.end)) {
    throw new RoutineError(
      "outside_day_window",
      `Blocks on that day live between ${window.start} and ${window.end}.`,
    );
  }
}

function assertFree(day: RoutineDay, candidate: { start: string; end: string }, ignoreId?: string): void {
  const start = toMinutes(candidate.start);
  const end = toMinutes(candidate.end);
  for (const block of day.blocks) {
    if (block.id === ignoreId) continue;
    if (start < toMinutes(block.end) && toMinutes(block.start) < end) {
      throw new RoutineError("block_overlap", `"${block.title}" already runs ${block.start}-${block.end}.`);
    }
  }
}

function sortDay(day: RoutineDay): RoutineDay {
  return { ...day, blocks: [...day.blocks].sort((left, right) => toMinutes(left.start) - toMinutes(right.start)) };
}

export async function loadRoutine(): Promise<RoutineSnapshot> {
  return snapshot();
}

export async function saveSettings(patch: Partial<RoutineSettings>): Promise<RoutineSnapshot> {
  const next: RoutineSettings = { ...state.settings, ...patch };
  if (toMinutes(next.dayEnd) <= toMinutes(next.dayStart)) {
    throw new RoutineError("outside_day_window", "The day has to end after it starts.");
  }
  state = { ...state, settings: next };
  return snapshot();
}

export async function createBlock(weekday: Weekday, input: BlockInput): Promise<RoutineSnapshot> {
  const day = findDay(weekday);
  assertPlacement(weekday, input);
  assertFree(day, input);

  const block: RoutineBlock = {
    id: `block-${Date.now().toString(36)}-${day.blocks.length}`,
    title: input.title.trim() || "Untitled block",
    start: input.start,
    end: input.end,
    intent: input.intent ?? "must",
    link: input.link ?? null,
    note: input.note ?? "",
  };

  state = {
    ...state,
    days: state.days.map((candidate) =>
      candidate.weekday === weekday ? sortDay({ ...candidate, blocks: [...candidate.blocks, block] }) : candidate,
    ),
  };
  return snapshot();
}

export async function updateBlock(blockId: string, patch: BlockPatch): Promise<RoutineSnapshot> {
  const { day, block } = findBlock(blockId);
  const next: RoutineBlock = {
    ...block,
    ...patch,
    title: (patch.title ?? block.title).trim() || "Untitled block",
  };
  assertPlacement(day.weekday, next);
  assertFree(day, next, blockId);

  state = {
    ...state,
    days: state.days.map((candidate) =>
      candidate.weekday === day.weekday
        ? sortDay({
            ...candidate,
            blocks: candidate.blocks.map((existing) => (existing.id === blockId ? next : existing)),
          })
        : candidate,
    ),
  };
  return snapshot();
}

/** Deleting a block deletes the record it left; the record belongs to the plan, not the other way round. */
export async function deleteBlock(blockId: string): Promise<RoutineSnapshot> {
  const { day } = findBlock(blockId);
  state = {
    ...state,
    days: state.days.map((candidate) =>
      candidate.weekday === day.weekday
        ? { ...candidate, blocks: candidate.blocks.filter((block) => block.id !== blockId) }
        : candidate,
    ),
    occurrences: state.occurrences.filter((entry) => entry.blockId !== blockId),
  };
  mirrors = mirrors.filter((entry) => entry.blockId !== blockId);
  return snapshot();
}

/** Copies one day onto the other six and marks it as the template the week was built from (S5). */
export async function repeatDay(weekday: Weekday): Promise<RoutineSnapshot> {
  const source = findDay(weekday);
  const stamp = Date.now().toString(36);

  state = {
    ...state,
    days: state.days.map((candidate) => {
      if (candidate.weekday === weekday) return { ...candidate, isTemplate: true };
      return {
        weekday: candidate.weekday,
        isTemplate: false,
        blocks: source.blocks.map((block, index) => ({
          ...block,
          id: `${candidate.weekday}-${stamp}-${index}`,
        })),
      };
    }),
  };

  // A copy is a new plan, so the records of the day it replaced no longer describe it.
  const keptBlockIds = new Set(state.days.flatMap((day) => day.blocks.map((block) => block.id)));
  state = { ...state, occurrences: state.occurrences.filter((entry) => keptBlockIds.has(entry.blockId)) };
  mirrors = mirrors.filter((entry) => keptBlockIds.has(entry.blockId));
  return snapshot();
}

export async function clearDay(weekday: Weekday): Promise<RoutineSnapshot> {
  const cleared = findDay(weekday).blocks.map((block) => block.id);
  state = {
    ...state,
    days: state.days.map((candidate) =>
      candidate.weekday === weekday ? { weekday, blocks: [], isTemplate: false } : candidate,
    ),
    occurrences: state.occurrences.filter((entry) => !cleared.includes(entry.blockId)),
  };
  mirrors = mirrors.filter((entry) => !cleared.includes(entry.blockId));
  return snapshot();
}

function recordMirror(next: LinkedMirror | null): void {
  if (next === null) return;
  mirrors = [...mirrors.filter((entry) => !(entry.blockId === next.blockId && entry.date === next.date)), next];
}

/**
 * The one write the user makes (S9). The routine record is written first and stands on its own; the mirror into the
 * linked habit, task or goal happens afterwards and may fail without taking the record with it.
 */
export async function setOccurrence(
  blockId: string,
  date: DayKey,
  patch: { status?: BlockStatus; note?: string },
): Promise<RoutineSnapshot> {
  const { block } = findBlock(blockId);
  if (date < addDays(fixtureToday, -(state.settings.editWindowDays - 1))) {
    throw new RoutineError("date_frozen", "This routine date is frozen.");
  }
  const existing = state.occurrences.find((entry) => entry.blockId === blockId && entry.date === date) ?? null;
  const status = patch.status ?? existing?.status ?? "pending";
  const note = patch.note ?? existing?.note ?? "";

  const withoutThis = state.occurrences.filter((entry) => !(entry.blockId === blockId && entry.date === date));
  // `pending` is the absence of a state, so it deletes the row instead of storing a sixth state. A note is the one
  // exception: the note accompanies any state, including the one the user has not chosen yet (S7).
  const keepRow = status !== "pending" || note.trim() !== "";
  state = {
    ...state,
    occurrences: keepRow ? [...withoutThis, { blockId, date, status, note }] : withoutThis,
  };

  if (block.link === null) {
    recordMirror(null);
    return snapshot();
  }

  const task = block.link.kind === "task" ? mockTasks.find((candidate) => candidate.id === block.link!.id) : undefined;
  const missing = deletedTargetIds.includes(block.link.id) || (block.link.kind === "task" && task === undefined);
  const noCompletedColumn = !missing && block.link.kind === "task" && task?.hasCompletedColumn === false && status === "done";
  recordMirror({
    blockId,
    date,
    target: block.link.kind,
    targetId: block.link.id,
    written: !missing && !noCompletedColumn && status === "done",
    reason: missing ? "target_missing" : noCompletedColumn ? "no_completed_column" : null,
  });
  return snapshot();
}

/** Wipes the prototype back to its seed, which is the only "persistence" this wave has (S11). */
export async function resetRoutine(): Promise<RoutineSnapshot> {
  const today = todayKey();
  fixtureToday = today;
  state = seedState();
  mirrors = seedMirrors(state, today);
  return snapshot();
}

/** Exposed so a test can prove the closed-day rule with a controlled "today". */
export function seedForTests(today: DayKey): RoutineSnapshot {
  fixtureToday = today;
  state = seedState();
  mirrors = seedMirrors(state, today);
  return snapshot();
}

/** Installs a fake HTTP server while leaving every caller on the real routine-api.ts fetch path. */
export function stubRoutineApi(today: DayKey): void {
  seedForTests(today);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname;
    const method = init?.method ?? "GET";
    const result = (snapshot: RoutineSnapshot) => ({
      settings: {
        ...snapshot.state.settings,
        dayWindows: Object.entries(snapshot.state.settings.dayWindows).map(([weekday, window]) => ({ weekday: Number(weekday), ...window })),
      },
      days: snapshot.state.days.map(({ weekday, isTemplate }) => ({ weekday, isTemplate })),
      blocks: snapshot.state.days.flatMap((day) => day.blocks.map((block) => ({ ...block, weekday: day.weekday }))),
      occurrences: snapshot.state.occurrences,
      mirrors: snapshot.mirrors,
    });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
    const weekdayMatch = path.match(/^\/api\/routine\/days\/(\d+)(?:\/(blocks|repeat))?$/);
    const blockMatch = path.match(/^\/api\/routine\/blocks\/([^/]+)(?:\/occurrences\/([^/]+))?$/);

    try {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
      if (path === "/api/routine/link-targets" && method === "GET") {
        const targets: LinkTargets = {
          habits: mockHabits.map((habit) => ({ ...habit, fieldId: `field-${habit.id}` })),
          tasks: mockTasks.map((task) => ({ id: task.id, title: task.title, projectName: task.project })),
          goals: mockGoals.map(({ id, title }) => ({ id, title })),
        };
        return reply(targets);
      }
      if (path === "/api/routine" && method === "GET") return reply(result(await loadRoutine()));
      if (path === "/api/routine/settings" && method === "PUT") {
        const patch = { ...body } as Partial<RoutineSettings>;
        if (Array.isArray(body.dayWindows)) {
          const windows: Partial<Record<Weekday, DayWindow>> = {};
          for (const entry of body.dayWindows as Array<{ weekday: Weekday; start: string | null; end?: string }>) {
            if (entry.start !== null && entry.end !== undefined) windows[entry.weekday] = { start: entry.start, end: entry.end };
          }
          patch.dayWindows = windows;
        }
        return reply(result(await saveSettings(patch)));
      }
      if (weekdayMatch !== null) {
        const weekday = Number(weekdayMatch[1]) as Weekday;
        if (weekdayMatch[2] === "blocks" && method === "POST") {
          // SAFETY: the client sends the BlockInput JSON shape for this fixture endpoint.
          return reply(result(await createBlock(weekday, body as unknown as BlockInput)));
        }
        if (weekdayMatch[2] === "repeat" && method === "POST") return reply(result(await repeatDay(weekday)));
        if (weekdayMatch[2] === undefined && method === "DELETE") return reply(result(await clearDay(weekday)));
      }
      if (blockMatch !== null) {
        const blockId = decodeURIComponent(blockMatch[1]!);
        if (blockMatch[2] !== undefined && method === "PUT") {
          return reply(result(await setOccurrence(blockId, decodeURIComponent(blockMatch[2]) as DayKey, body as { status?: BlockStatus; note?: string })));
        }
        if (blockMatch[2] === undefined && method === "PATCH") return reply(result(await updateBlock(blockId, body as BlockPatch)));
        if (blockMatch[2] === undefined && method === "DELETE") return reply(result(await deleteBlock(blockId)));
      }
      return reply({ error: "not_found", message: `No fixture route for ${method} ${path}.` }, 404);
    } catch (failure) {
      if (failure instanceof RoutineError) return reply({ error: failure.code, message: failure.message }, 400);
      return reply({ error: "internal_error", message: failure instanceof Error ? failure.message : "Unknown error." }, 500);
    }
  };
}
