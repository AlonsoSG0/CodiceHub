import { app } from "../../server/src/app.js";
import type { ChubDatabase } from "../../server/src/db/client.js";
import { isTimeZone, todayInZone } from "../../server/src/routine/timezone.js";

/** The zone the web app documents as its default, used when the workspace preference is missing or invalid. */
export const FALLBACK_TIMEZONE = "America/Mexico_City";

export type OpsErrorCode = "not_found" | "ambiguous" | "no_check_field" | "invalid_date" | "api_error";

/** A domain failure the CLI reports on stderr. `ops.ts` decides the code; the caller decides the exit code. */
export class OpsError extends Error {
  constructor(readonly code: OpsErrorCode, message: string) {
    super(message);
    this.name = "OpsError";
  }
}

export type HabitFieldKind = "check" | "number" | "text";

export type HabitFieldView = {
  id: string;
  kind: HabitFieldKind;
  label: string;
  unit: string | null;
  target: number | null;
  value: boolean | number | string | null;
};

export type HabitView = {
  id: string;
  name: string;
  icon: string | null;
  archived: boolean;
  fields: HabitFieldView[];
};

export type HabitListResult = { date: string; timezone: string; habits: HabitView[] };

export type HabitDoneResult = {
  date: string;
  timezone: string;
  habit: { id: string; name: string };
  entries: Array<{ fieldId: string; kind: "check"; label: string; value: boolean }>;
};

type ApiField = {
  id: string;
  kind: HabitFieldKind;
  label: string;
  unit: string | null;
  target: number | null;
  archivedAt: string | null;
};

type ApiHabit = { id: string; name: string; icon: string | null; archivedAt: string | null; fields: ApiField[] };
type ApiEntry = { fieldId: string; value: boolean | number | string };

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Call the Hono app in process. Same routing, validation and error codes as the server, without a socket, so the
 * CLI works whether or not `chub` is running.
 */
async function call(db: ChubDatabase, path: string, init?: RequestInit): Promise<unknown> {
  const response = await app.fetch(new Request(`http://chub.invalid${path}`, init), { db });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    const code = body?.error === "invalid_date" ? "invalid_date" : "api_error";
    throw new OpsError(code, body?.error ? `${path} was rejected: ${body.error}` : `${path} answered ${response.status}`);
  }
  return response.json();
}

async function workspaceTimeZone(db: ChubDatabase): Promise<string> {
  try {
    const payload = (await call(db, "/api/preferences")) as { preferences?: Record<string, unknown> };
    const stored = payload.preferences?.["workspace.timezone"];
    if (isTimeZone(stored)) return stored;
  } catch {
    // A preference that cannot be read is not worth failing a command over: fall back to the documented default.
  }
  return FALLBACK_TIMEZONE;
}

/** The day a command acts on: the workspace day, never the device day, unless `--date` overrides it. */
export async function resolveDay(db: ChubDatabase, override?: string): Promise<{ date: string; timezone: string }> {
  const timezone = await workspaceTimeZone(db);
  const date = override ?? todayInZone(timezone);
  if (!dayPattern.test(date)) throw new OpsError("invalid_date", `${date} is not a YYYY-MM-DD day`);
  return { date, timezone };
}

function toHabitView(habit: ApiHabit, values: Map<string, boolean | number | string>): HabitView {
  return {
    id: habit.id,
    name: habit.name,
    icon: habit.icon,
    archived: habit.archivedAt !== null,
    fields: habit.fields.map((field) => ({
      id: field.id,
      kind: field.kind,
      label: field.label,
      unit: field.unit,
      target: field.target,
      value: values.get(field.id) ?? null,
    })),
  };
}

/**
 * Resolve a habit by name: an exact case-insensitive match wins, otherwise a unique case-insensitive substring.
 * An ambiguous or missing name is a domain failure, not a guess.
 */
function resolveHabit(habits: ApiHabit[], name: string): ApiHabit {
  const needle = name.trim().toLowerCase();
  const exact = habits.filter((habit) => habit.name.trim().toLowerCase() === needle);
  const candidates = exact.length > 0 ? exact : habits.filter((habit) => habit.name.toLowerCase().includes(needle));
  const [only, ...rest] = candidates;
  if (only === undefined) throw new OpsError("not_found", `no habit matches "${name}"`);
  if (rest.length > 0) throw ambiguous(needle, candidates);
  return only;
}

function ambiguous(needle: string, habits: ApiHabit[]): OpsError {
  return new OpsError("ambiguous", `"${needle}" is ambiguous: ${habits.map((habit) => habit.name).join(", ")}`);
}

export async function listHabits(db: ChubDatabase, options: { archived?: boolean } = {}): Promise<HabitListResult> {
  const day = await resolveDay(db);
  const [habitsPayload, entriesPayload] = (await Promise.all([
    call(db, `/api/habits?archived=${options.archived ? 1 : 0}`),
    call(db, `/api/habits/entries?from=${day.date}&to=${day.date}`),
  ])) as [{ habits: ApiHabit[] }, { entries: ApiEntry[] }];

  const values = new Map(entriesPayload.entries.map((entry) => [entry.fieldId, entry.value]));
  return {
    date: day.date,
    timezone: day.timezone,
    habits: habitsPayload.habits.map((habit) => toHabitView(habit, values)),
  };
}

/** Mark every non-archived check field of one habit as done for the day, leaving the other fields untouched. */
export async function doneHabit(
  db: ChubDatabase,
  name: string,
  options: { date?: string } = {},
): Promise<HabitDoneResult> {
  const day = await resolveDay(db, options.date);
  const payload = (await call(db, "/api/habits?archived=0")) as { habits: ApiHabit[] };
  const habit = resolveHabit(payload.habits, name);

  const checks = habit.fields.filter((field) => field.kind === "check" && field.archivedAt === null);
  if (checks.length === 0) throw new OpsError("no_check_field", `${habit.name} has no check field to mark`);

  await call(db, `/api/habits/${habit.id}/entries/${day.date}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: checks.map((field) => ({ fieldId: field.id, value: true })) }),
  });

  return {
    date: day.date,
    timezone: day.timezone,
    habit: { id: habit.id, name: habit.name },
    entries: checks.map((field) => ({ fieldId: field.id, kind: "check" as const, label: field.label, value: true })),
  };
}
