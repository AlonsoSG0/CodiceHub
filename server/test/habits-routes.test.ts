import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import type { Habit } from "../src/habits/repository.js";
import { app } from "../src/app.js";

const missingId = "00000000-0000-4000-8000-000000000000";
// A fixed past day keeps the range assertions independent of when the suite runs.
const day = "2026-01-05";

async function expectJson(response: Response, status: number, body: unknown): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await response.text()).toBe(JSON.stringify(body));
}

async function expectHabit(response: Response, status: number, expected: Partial<Habit> = {}): Promise<Habit> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const habit = (await response.json()) as Habit;
  expect(Object.keys(habit)).toEqual([
    "id",
    "name",
    "icon",
    "position",
    "section",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "fields",
  ]);
  expect(habit.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(habit).toMatchObject(expected);
  return habit;
}

describe("habits HTTP API", () => {
  let db: ChubDatabase;
  let api: { request: (input: string, init?: RequestInit) => Promise<Response> };

  const post = (path: string, body: unknown): Promise<Response> =>
    api.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const patch = (path: string, body: unknown): Promise<Response> =>
    api.request(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const put = (path: string, body: unknown): Promise<Response> =>
    api.request(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const createHabit = async (name: string): Promise<Habit> => {
    const response = await post("/api/habits", { name });
    return (await response.json()) as Habit;
  };

  beforeEach(() => {
    db = createDb(join(mkdtempSync(join(tmpdir(), "chub-habits-api-")), "chub.db"));
    api = { request: (input, init) => app.request(input, init, { db }) };
  });

  afterEach(() => db.$client.close());

  it("creates a habit with its Done check field", async () => {
    const habit = await expectHabit(await post("/api/habits", { name: "Lectura" }), 201, {
      name: "Lectura",
      icon: null,
      archivedAt: null,
      position: 0,
    });

    expect(habit.fields).toHaveLength(1);
    expect(habit.fields[0]).toMatchObject({ kind: "check", label: "Done", position: 0, archivedAt: null });
  });

  it("stores a habit icon under the same kebab-case contract the page icons use", async () => {
    // The browser sends the value the icon picker offers; a React component name such as "BookOpen" is rejected.
    await expectHabit(await post("/api/habits", { name: "Lectura", icon: "book-open" }), 201, { icon: "book-open" });
  });

  it("separates the active habits from the archived ones", async () => {
    const kept = await createHabit("Lectura");
    const retired = await createHabit("Gym");

    const archivedHabit = await expectHabit(await patch(`/api/habits/${retired.id}`, { archived: true }), 200, {
      id: retired.id,
      archivedAt: expect.any(String),
    });
    expect(archivedHabit.archivedAt).not.toBeNull();

    const active = (await (await api.request("/api/habits")).json()) as { habits: Habit[] };
    expect(active.habits.map(({ id }) => id)).toEqual([kept.id]);

    const archived = (await (await api.request("/api/habits?archived=1")).json()) as { habits: Habit[] };
    expect(archived.habits.map(({ id }) => id)).toEqual([retired.id]);
    expect(archived.habits[0]!.archivedAt).not.toBeNull();
  });

  it("keeps each section's habits apart", async () => {
    const habitsHabit = await createHabit("Lectura");
    const booksHabit = await expectHabit(await post("/api/habits", { name: "Reading", section: "books" }), 201, {
      name: "Reading",
      section: "books",
    });

    const habits = (await (await api.request("/api/habits?section=habits")).json()) as { habits: Habit[] };
    expect(habits.habits.map(({ id }) => id)).toEqual([habitsHabit.id]);

    const books = (await (await api.request("/api/habits?section=books")).json()) as { habits: Habit[] };
    expect(books.habits.map(({ id }) => id)).toEqual([booksHabit.id]);

    // Without a section, both surfaces' habits are listed.
    const all = (await (await api.request("/api/habits")).json()) as { habits: Habit[] };
    expect(all.habits.map(({ id }) => id).sort()).toEqual([habitsHabit.id, booksHabit.id].sort());

    await expectJson(await api.request("/api/habits?section=nope"), 400, { error: "invalid_section" });
  });

  it("writes one day of entries and reads the range back", async () => {
    const habit = await createHabit("Lectura");
    const fieldId = habit.fields[0]!.id;

    const written = await put(`/api/habits/${habit.id}/entries/${day}`, {
      values: [{ fieldId, value: true }],
    });
    await expectJson(written, 200, {
      entries: [{ habitId: habit.id, fieldId, date: day, kind: "check", value: true }],
    });

    // `/habits/entries` must be matched before `/habits/:id`, or this returns habit_not_found.
    await expectJson(await api.request(`/api/habits/entries?from=${day}&to=${day}`), 200, {
      entries: [{ habitId: habit.id, fieldId, date: day, kind: "check", value: true }],
    });
  });

  it("clears a day with a null value and rejects a wrong type without writing", async () => {
    const habit = await createHabit("Lectura");
    const fieldId = habit.fields[0]!.id;
    await put(`/api/habits/${habit.id}/entries/${day}`, { values: [{ fieldId, value: true }] });

    await expectJson(await put(`/api/habits/${habit.id}/entries/${day}`, { values: [{ fieldId, value: "yes" }] }), 400, {
      error: "invalid_value",
    });
    expect(await db.$client.prepare("SELECT COUNT(*) AS count FROM habit_entries").get()).toEqual({ count: 1 });

    await expectJson(await put(`/api/habits/${habit.id}/entries/${day}`, { values: [{ fieldId, value: null }] }), 200, {
      entries: [],
    });
    expect(await db.$client.prepare("SELECT COUNT(*) AS count FROM habit_entries").get()).toEqual({ count: 0 });
  });

  it("rejects a malformed body, an impossible day and a future day", async () => {
    const habit = await createHabit("Lectura");
    const fieldId = habit.fields[0]!.id;

    expect((await api.request("/api/habits", { method: "POST", body: "{" })).status).toBe(400);
    await expectJson(await put(`/api/habits/${habit.id}/entries/2026-02-30`, {
      values: [{ fieldId, value: true }],
    }), 400, { error: "invalid_date" });
    await expectJson(await put(`/api/habits/${habit.id}/entries/2999-01-01`, {
      values: [{ fieldId, value: true }],
    }), 400, { error: "invalid_date" });
    await expectJson(await post("/api/habits", { name: 7 }), 400, { error: "invalid_name" });
    await expectJson(await post("/api/habits", { icon: "Not An Icon" }), 400, { error: "invalid_icon" });
    expect(await db.$client.prepare("SELECT COUNT(*) AS count FROM habit_entries").get()).toEqual({ count: 0 });
  });

  it("adds, updates and removes fields, reporting what removal did", async () => {
    const habit = await createHabit("Lectura");

    const withNumber = await expectHabit(
      await post(`/api/habits/${habit.id}/fields`, { kind: "number", label: "Pages", unit: "pages", target: 12 }),
      201,
    );
    const numberField = withNumber.fields.find(({ kind }) => kind === "number")!;
    expect(numberField).toMatchObject({ label: "Pages", unit: "pages", target: 12, position: 1 });

    const renamed = await expectHabit(
      await patch(`/api/habits/${habit.id}/fields/${numberField.id}`, { label: "Read pages" }),
      200,
    );
    expect(renamed.fields.find(({ id }) => id === numberField.id)!.label).toBe("Read pages");

    await put(`/api/habits/${habit.id}/entries/${day}`, { values: [{ fieldId: numberField.id, value: 12 }] });
    const archivedRemoval = await api.request(`/api/habits/${habit.id}/fields/${numberField.id}`, { method: "DELETE" });
    expect(archivedRemoval.status).toBe(200);
    const archivedBody = (await archivedRemoval.json()) as { habit: Habit; field: "deleted" | "archived" };
    expect(archivedBody.field).toBe("archived");
    expect(archivedBody.habit.fields.find(({ id }) => id === numberField.id)?.archivedAt).toEqual(expect.any(String));

    const emptyField = (await (await post(`/api/habits/${habit.id}/fields`, { kind: "text" })).json()) as Habit;
    const textField = emptyField.fields.find(({ kind }) => kind === "text")!;
    const deletedRemoval = await api.request(`/api/habits/${habit.id}/fields/${textField.id}`, { method: "DELETE" });
    expect(deletedRemoval.status).toBe(200);
    expect(await deletedRemoval.json()).toMatchObject({ field: "deleted" });
  });

  it("refuses to purge an active habit and purges an archived one with everything it stored", async () => {
    const habit = await createHabit("Lectura");
    const fieldId = habit.fields[0]!.id;
    await put(`/api/habits/${habit.id}/entries/${day}`, { values: [{ fieldId, value: true }] });

    await expectJson(await api.request(`/api/habits/${habit.id}/purge`, { method: "DELETE" }), 400, {
      error: "habit_not_archived",
    });

    await patch(`/api/habits/${habit.id}`, { archived: true });
    await expectJson(await api.request(`/api/habits/${habit.id}/purge`, { method: "DELETE" }), 200, {
      purged: [habit.id],
    });

    await expectJson(await api.request(`/api/habits/${habit.id}`), 404, { error: "habit_not_found" });
    expect(await db.$client.prepare("SELECT COUNT(*) AS count FROM habit_entries").get()).toEqual({ count: 0 });
    expect(await db.$client.prepare("SELECT COUNT(*) AS count FROM habit_fields").get()).toEqual({ count: 0 });
    expect(db.$client.pragma("foreign_key_check")).toEqual([]);
  });

  it("names the missing habit and the missing field instead of inventing a success", async () => {
    const habit = await createHabit("Lectura");

    await expectJson(await api.request(`/api/habits/${missingId}`), 404, { error: "habit_not_found" });
    await expectJson(await patch(`/api/habits/${missingId}`, { name: "x" }), 404, { error: "habit_not_found" });
    await expectJson(await patch(`/api/habits/${habit.id}/fields/${missingId}`, { label: "x" }), 404, {
      error: "field_not_found",
    });
    await expectJson(await api.request(`/api/habits/entries?from=2026-02-30&to=${day}`), 400, {
      error: "invalid_date",
    });
  });

  it("rejects an unknown route under the habits namespace", async () => {
    await expectJson(await api.request("/api/habits/nope/deeper"), 404, { error: "not_found" });
  });
});
