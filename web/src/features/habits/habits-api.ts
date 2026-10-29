import { ApiError } from "@/lib/api";
import type { DayKey } from "./date";

export type HabitFieldKind = "check" | "number" | "text";

export type HabitField = {
  id: string;
  habitId: string;
  kind: HabitFieldKind;
  label: string;
  unit: string | null;
  target: number | null;
  position: number;
  archivedAt: string | null;
};

/** Which surface owns a habit. `books` marks the reading habit the books section creates and records; /habits lists it like any other habit. */
export type HabitSection = "habits" | "books";

export type Habit = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  section: HabitSection;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  fields: HabitField[];
};

/** A stored value, already typed for its field's kind. */
export type HabitEntryValue = boolean | number | string;

export type HabitEntry = {
  habitId: string;
  fieldId: string;
  date: DayKey;
  kind: HabitFieldKind;
  value: HabitEntryValue;
};

/** One field's value for one day; `null` clears that day for that field. */
export type HabitValueInput = { fieldId: string; value: HabitEntryValue | null };

export type CreateHabitInput = { name?: string; icon?: string | null; position?: number; section?: HabitSection };
export type UpdateHabitInput = { name?: string; icon?: string | null; archived?: boolean };
export type HabitFieldInput = {
  kind: HabitFieldKind;
  label?: string;
  unit?: string | null;
  target?: number | null;
  position?: number;
};
export type HabitFieldPatch = {
  label?: string;
  unit?: string | null;
  target?: number | null;
  position?: number;
};

/** Whether removing a field dropped it or only archived a field that already had entries. */
export type RemovedHabitField = { habit: Habit; field: "deleted" | "archived" };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();

  if (!response.ok) {
    const code =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `http_${response.status}`;
    throw new ApiError(code, response.status);
  }

  return body as T;
}

function jsonInit(method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function habitPath(id: string, suffix = ""): string {
  return `/api/habits/${encodeURIComponent(id)}${suffix}`;
}

export async function fetchHabits(options?: { archived?: boolean; section?: HabitSection }): Promise<Habit[]> {
  const query = new URLSearchParams();
  if (options?.archived) query.set("archived", "1");
  if (options?.section) query.set("section", options.section);
  const suffix = query.toString();
  const response = await requestJson<{ habits: Habit[] }>(suffix === "" ? "/api/habits" : `/api/habits?${suffix}`);
  return response.habits;
}

export function fetchHabit(id: string): Promise<Habit> {
  return requestJson<Habit>(habitPath(id));
}

export function createHabit(input: CreateHabitInput): Promise<Habit> {
  return requestJson<Habit>("/api/habits", jsonInit("POST", input));
}

export function updateHabit(id: string, patch: UpdateHabitInput): Promise<Habit> {
  return requestJson<Habit>(habitPath(id), jsonInit("PATCH", patch));
}

export async function purgeHabit(id: string): Promise<string[]> {
  const response = await requestJson<{ purged: string[] }>(habitPath(id, "/purge"), { method: "DELETE" });
  return response.purged;
}

export async function fetchHabitEntries(range: { from: DayKey; to: DayKey }): Promise<HabitEntry[]> {
  const query = new URLSearchParams({ from: range.from, to: range.to });
  const response = await requestJson<{ entries: HabitEntry[] }>(`/api/habits/entries?${query.toString()}`);
  return response.entries;
}

export async function setHabitEntries(
  habitId: string,
  date: DayKey,
  values: HabitValueInput[],
): Promise<HabitEntry[]> {
  const path = habitPath(habitId, `/entries/${encodeURIComponent(date)}`);
  const response = await requestJson<{ entries: HabitEntry[] }>(path, jsonInit("PUT", { values }));
  return response.entries;
}

export function addHabitField(habitId: string, input: HabitFieldInput): Promise<Habit> {
  return requestJson<Habit>(habitPath(habitId, "/fields"), jsonInit("POST", input));
}

export function updateHabitField(habitId: string, fieldId: string, patch: HabitFieldPatch): Promise<Habit> {
  const path = habitPath(habitId, `/fields/${encodeURIComponent(fieldId)}`);
  return requestJson<Habit>(path, jsonInit("PATCH", patch));
}

export function removeHabitField(habitId: string, fieldId: string): Promise<RemovedHabitField> {
  const path = habitPath(habitId, `/fields/${encodeURIComponent(fieldId)}`);
  return requestJson<RemovedHabitField>(path, { method: "DELETE" });
}
