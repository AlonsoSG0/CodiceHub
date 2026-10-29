import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  addHabitField,
  createHabit,
  fetchHabitEntries,
  fetchHabits,
  purgeHabit,
  removeHabitField,
  setHabitEntries,
  updateHabit,
  type Habit,
} from "./habits-api";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const habit: Habit = {
  id: "h1",
  name: "Lectura",
  icon: null,
  position: 0,
  section: "habits",
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  fields: [
    {
      id: "f1",
      habitId: "h1",
      kind: "check",
      label: "Done",
      unit: null,
      target: null,
      position: 0,
      archivedAt: null,
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("habits API client", () => {
  it("lists active habits, and archived ones only when asked", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ habits: [habit] }));
    vi.stubGlobal("fetch", request);

    await expect(fetchHabits()).resolves.toEqual([habit]);
    expect(request.mock.calls[0]?.[0]).toBe("/api/habits");

    await expect(fetchHabits({ archived: true })).resolves.toEqual([habit]);
    expect(request.mock.calls[1]?.[0]).toBe("/api/habits?archived=1");
  });

  it("asks for one section's habits when the caller names one", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ habits: [habit] }));
    vi.stubGlobal("fetch", request);

    await fetchHabits({ section: "books" });
    expect(request.mock.calls[0]?.[0]).toBe("/api/habits?section=books");

    await fetchHabits({ section: "habits" });
    expect(request.mock.calls[1]?.[0]).toBe("/api/habits?section=habits");
  });

  it("loads an entry range between two local days", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ entries: [] }));
    vi.stubGlobal("fetch", request);

    await fetchHabitEntries({ from: "2026-01-01", to: "2026-01-31" });

    expect(request.mock.calls[0]?.[0]).toBe("/api/habits/entries?from=2026-01-01&to=2026-01-31");
  });

  it("puts one day of values scoped to the habit and the date", async () => {
    const entry = { habitId: "h1", fieldId: "f1", date: "2026-01-05", kind: "check", value: true };
    const request = vi.fn().mockResolvedValue(jsonResponse({ entries: [entry] }));
    vi.stubGlobal("fetch", request);

    await expect(
      setHabitEntries("h1", "2026-01-05", [{ fieldId: "f1", value: true }]),
    ).resolves.toEqual([entry]);

    expect(request).toHaveBeenCalledWith("/api/habits/h1/entries/2026-01-05", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [{ fieldId: "f1", value: true }] }),
    });
  });

  it("creates a habit and adds a field through the habit routes", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse(habit, 201));
    vi.stubGlobal("fetch", request);

    await createHabit({ name: "Lectura" });
    expect(request).toHaveBeenCalledWith("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Lectura" }),
    });

    await updateHabit("h1", { archived: true });
    expect(request.mock.calls[1]?.[0]).toBe("/api/habits/h1");
    expect(request.mock.calls[1]?.[1]).toMatchObject({ method: "PATCH" });

    await addHabitField("h1", { kind: "number", label: "Pages", target: 12 });
    expect(request.mock.calls[2]?.[0]).toBe("/api/habits/h1/fields");
    expect(request.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ kind: "number", label: "Pages", target: 12 }),
    });
  });

  it("reports whether a removed field was deleted or archived", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ habit, field: "archived" }));
    vi.stubGlobal("fetch", request);

    await expect(removeHabitField("h1", "f1")).resolves.toEqual({ habit, field: "archived" });
    expect(request).toHaveBeenCalledWith("/api/habits/h1/fields/f1", { method: "DELETE" });
  });

  it("purges an archived habit and surfaces the error code otherwise", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ purged: ["h1"] }));
    vi.stubGlobal("fetch", request);

    await expect(purgeHabit("h1")).resolves.toEqual(["h1"]);
    expect(request).toHaveBeenCalledWith("/api/habits/h1/purge", { method: "DELETE" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "habit_not_archived" }, 400)));
    await expect(purgeHabit("h1")).rejects.toBeInstanceOf(ApiError);
    await expect(purgeHabit("h1")).rejects.toMatchObject({ code: "habit_not_archived", status: 400 });
  });
});
