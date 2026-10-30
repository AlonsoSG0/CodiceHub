import { app } from "../../server/src/app.js";
import type { ChubDatabase } from "../../server/src/db/client.js";
import { isTimeZone, todayInZone } from "../../server/src/routine/timezone.js";

/** The zone the web app documents as its default, used when the workspace preference is missing or invalid. */
export const FALLBACK_TIMEZONE = "America/Mexico_City";

export type OpsErrorCode = "not_found" | "ambiguous" | "no_check_field" | "invalid_date" | "invalid_value" | "api_error";

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
  section: "habits" | "books";
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

type ApiHabit = { id: string; name: string; icon: string | null; section: "habits" | "books"; archivedAt: string | null; fields: ApiField[] };
type ApiEntry = { habitId: string; fieldId: string; date: string; kind: HabitFieldKind; value: boolean | number | string };

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Call the Hono app in process. Same routing, validation and error codes as the server, without a socket, so the
 * CLI works whether or not `chub` is running.
 */
/** One in-process call against the Hono app, with the shared failure mapping. */
export async function callResponse(db: ChubDatabase, path: string, init?: RequestInit): Promise<Response> {
  const response = await app.fetch(new Request(`http://chub.invalid${path}`, init), { db });
  if (response.ok) return response;
  const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  const code = body?.error === "invalid_date" ? "invalid_date" : "api_error";
  throw new OpsError(code, body?.error ? `${path} was rejected: ${body.error}` : `${path} answered ${response.status}`);
}

export async function call(db: ChubDatabase, path: string, init?: RequestInit): Promise<unknown> {
  return (await callResponse(db, path, init)).json();
}

/** For routes that answer something other than JSON, like the Markdown export. */
export async function callText(db: ChubDatabase, path: string, init?: RequestInit): Promise<string> {
  return (await callResponse(db, path, init)).text();
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
    section: habit.section,
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

export async function listHabits(db: ChubDatabase, options: { archived?: boolean; section?: "habits" | "books" } = {}): Promise<HabitListResult> {
  const day = await resolveDay(db);
  const [habitsPayload, entriesPayload] = (await Promise.all([
    call(db, `/api/habits?archived=${options.archived ? 1 : 0}${options.section ? `&section=${options.section}` : ""}`),
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
  return markHabit(db, name, true, options);
}

export async function undoHabit(db: ChubDatabase, name: string, options: { date?: string } = {}): Promise<HabitDoneResult> {
  return markHabit(db, name, false, options);
}

async function markHabit(db: ChubDatabase, name: string, value: boolean, options: { date?: string }): Promise<HabitDoneResult> {
  const day = await resolveDay(db, options.date);
  const payload = (await call(db, "/api/habits?archived=0")) as { habits: ApiHabit[] };
  const habit = resolveHabit(payload.habits, name);

  const checks = habit.fields.filter((field) => field.kind === "check" && field.archivedAt === null);
  if (checks.length === 0) throw new OpsError("no_check_field", `${habit.name} has no check field to mark`);

  await call(db, `/api/habits/${habit.id}/entries/${day.date}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: checks.map((field) => ({ fieldId: field.id, value })) }),
  });

  return {
    date: day.date,
    timezone: day.timezone,
    habit: { id: habit.id, name: habit.name },
    entries: checks.map((field) => ({ fieldId: field.id, kind: "check" as const, label: field.label, value })),
  };
}

async function findHabit(db: ChubDatabase, name: string, archived = false): Promise<ApiHabit> {
  const payload = await call(db, `/api/habits?archived=${archived ? 1 : 0}`) as { habits: ApiHabit[] };
  return resolveHabit(payload.habits, name);
}

function resolveField(habit: ApiHabit, label: string): ApiField {
  const fields = habit.fields.filter((field) => field.archivedAt === null);
  const needle = label.trim().toLowerCase();
  const exact = fields.filter((field) => field.label.trim().toLowerCase() === needle);
  const matches = exact.length ? exact : fields.filter((field) => field.label.toLowerCase().includes(needle));
  if (!matches.length) throw new OpsError("not_found", `no field matches "${label}"`);
  if (matches.length > 1) throw new OpsError("ambiguous", `"${needle}" is ambiguous: ${matches.map((field) => field.label).join(", ")}`);
  return matches[0]!;
}

function parseValue(kind: HabitFieldKind, input: string): boolean | number | string {
  if (kind === "text") return input;
  if (kind === "check") {
    if (["true", "yes", "1"].includes(input.toLowerCase())) return true;
    if (["false", "no", "0"].includes(input.toLowerCase())) return false;
  } else if (input.trim() !== "" && Number.isFinite(Number(input))) return Number(input);
  throw new OpsError("invalid_value", `invalid ${kind} value: ${input}`);
}

function json(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export async function setHabitValue(db: ChubDatabase, name: string, label: string, input: string, options: { date?: string; clear?: boolean } = {}) {
  const day = await resolveDay(db, options.date);
  const habit = await findHabit(db, name);
  const field = resolveField(habit, label);
  const value = options.clear ? null : parseValue(field.kind, input);
  await call(db, `/api/habits/${habit.id}/entries/${day.date}`, json("PUT", { values: [{ fieldId: field.id, value }] }));
  return { ...day, habit: { id: habit.id, name: habit.name }, field: { id: field.id, kind: field.kind, label: field.label }, value };
}

export async function logHabit(db: ChubDatabase, name: string, options: { days?: number; from?: string; to?: string } = {}) {
  const habit = await findHabit(db, name);
  const today = (await resolveDay(db)).date;
  const to = options.to ?? today;
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((options.days ?? 14) - 1));
  const from = options.from ?? start.toISOString().slice(0, 10);
  const payload = await call(db, `/api/habits/entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) as { entries: ApiEntry[] };
  const fields = new Map(habit.fields.map((field) => [field.id, field]));
  const entries = payload.entries.filter((entry) => entry.habitId === habit.id && fields.has(entry.fieldId))
    .map((entry) => ({ date: entry.date, fieldId: entry.fieldId, kind: entry.kind, label: fields.get(entry.fieldId)!.label, value: entry.value }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { habit: { id: habit.id, name: habit.name }, from, to, entries };
}

export async function createHabit(db: ChubDatabase, name: string, options: { icon?: string; section?: "habits" | "books" }) {
  const payload = await call(db, "/api/habits", json("POST", { name, ...options })) as ApiHabit;
  return toHabitView(payload, new Map());
}

export async function changeHabit(db: ChubDatabase, name: string, change: { name?: string; archived?: boolean }) {
  const habit = await findHabit(db, name, change.archived === false);
  const payload = await call(db, `/api/habits/${habit.id}`, json("PATCH", change)) as ApiHabit;
  return toHabitView(payload, new Map());
}

type FieldChanges = { label?: string; unit?: string; target?: number };
export async function addField(db: ChubDatabase, name: string, field: FieldChanges & { kind: HabitFieldKind }) {
  const habit = await findHabit(db, name);
  const payload = await call(db, `/api/habits/${habit.id}/fields`, json("POST", field)) as ApiHabit;
  return toHabitView(payload, new Map());
}

export async function updateField(db: ChubDatabase, name: string, label: string, changes: FieldChanges) {
  const habit = await findHabit(db, name);
  const field = resolveField(habit, label);
  const payload = await call(db, `/api/habits/${habit.id}/fields/${field.id}`, json("PATCH", changes)) as ApiHabit;
  return toHabitView(payload, new Map());
}
