import { describe, expect, it } from "vitest";
import { completionRate, currentStreak, dayLevel, longestStreak } from "./level";
import type { Habit, HabitEntry, HabitField, HabitFieldKind, HabitEntryValue } from "./habits-api";

function field(id: string, kind: HabitFieldKind, extra: Partial<HabitField> = {}): HabitField {
  return {
    id,
    habitId: "h1",
    kind,
    label: id,
    unit: null,
    target: null,
    position: 0,
    archivedAt: null,
    ...extra,
  };
}

function habit(fields: HabitField[], id = "h1"): Habit {
  return {
    id,
    name: "Lectura",
    icon: null,
    position: 0,
    section: "habits",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fields,
  };
}

function entry(fieldId: string, date: string, value: HabitEntryValue, habitId = "h1"): HabitEntry {
  const kind = typeof value === "boolean" ? "check" : typeof value === "number" ? "number" : "text";
  return { habitId, fieldId, date, kind, value };
}

const check = field("done", "check");

describe("habit day levels", () => {
  it("reads a check-only habit as binary", () => {
    const lecturas = habit([check]);
    const entries = [entry("done", "2026-01-05", true)];

    expect(dayLevel(lecturas, "2026-01-05", entries)).toBe(4);
    expect(dayLevel(lecturas, "2026-01-06", entries)).toBe(0);
  });

  it("needs a number to reach its target, and only to be recorded when it has none", () => {
    const timed = habit([field("minutes", "number", { unit: "min", target: 30 })]);
    const pages = habit([field("pages", "number")]);

    expect(dayLevel(timed, "2026-01-05", [entry("minutes", "2026-01-05", 30)])).toBe(4);
    expect(dayLevel(timed, "2026-01-05", [entry("minutes", "2026-01-05", 29)])).toBe(0);
    expect(dayLevel(pages, "2026-01-05", [entry("pages", "2026-01-05", 1)])).toBe(4);
    expect(dayLevel(pages, "2026-01-05", [entry("pages", "2026-01-05", 0)])).toBe(0);
  });

  it("never counts a text field towards completion", () => {
    const withNote = habit([check, field("note", "text")]);

    // The comment is optional, so a checked day is complete without one.
    expect(dayLevel(withNote, "2026-01-05", [entry("done", "2026-01-05", true)])).toBe(4);
    // And a comment on its own does not complete a check that was not ticked.
    expect(dayLevel(withNote, "2026-01-05", [entry("note", "2026-01-05", "leyendo")])).toBe(0);
  });

  it("grades a day by the share of its trackable fields that were satisfied", () => {
    const both = habit([check, field("minutes", "number", { target: 30 })]);
    const done = entry("done", "2026-01-05", true);
    const half = entry("minutes", "2026-01-05", 30);
    const partial = entry("minutes", "2026-01-05", 10);

    expect(dayLevel(both, "2026-01-05", [done, half])).toBe(4);
    expect(dayLevel(both, "2026-01-05", [done, partial])).toBe(2);
    expect(dayLevel(both, "2026-01-05", [partial])).toBe(0);

    const three = habit([check, field("minutes", "number"), field("pages", "number")]);
    expect(dayLevel(three, "2026-01-05", [entry("done", "2026-01-05", true)])).toBe(1);
  });

  it("falls back to any entry when a habit has nothing trackable", () => {
    const diary = habit([field("note", "text")]);

    expect(dayLevel(diary, "2026-01-05", [entry("note", "2026-01-05", "hola")])).toBe(4);
    expect(dayLevel(diary, "2026-01-05", [])).toBe(0);
  });

  it("ignores the entries of another habit on the same day", () => {
    const lecturas = habit([check]);
    const other = [entry("done", "2026-01-05", true, "h2")];

    expect(dayLevel(lecturas, "2026-01-05", other)).toBe(0);
  });
});

describe("habit streaks", () => {
  const lecturas = habit([check]);

  it("does not let an unfinished today break the run", () => {
    const finished = [entry("done", "2026-01-08", true), entry("done", "2026-01-09", true)];

    expect(currentStreak(lecturas, "2026-01-10", finished)).toBe(2);
    expect(currentStreak(lecturas, "2026-01-10", [...finished, entry("done", "2026-01-10", true)])).toBe(3);
  });

  it("ends the run at the first missed day before today", () => {
    const entries = [entry("done", "2026-01-09", true), entry("done", "2026-01-07", true)];

    expect(currentStreak(lecturas, "2026-01-10", entries)).toBe(1);
    expect(currentStreak(lecturas, "2026-01-11", entries)).toBe(0);
  });

  it("reports the longest run inside the range", () => {
    const entries = [
      entry("done", "2026-01-02", true),
      entry("done", "2026-01-03", true),
      entry("done", "2026-01-04", true),
      entry("done", "2026-01-08", true),
      entry("done", "2026-01-09", true),
    ];

    expect(longestStreak(lecturas, "2026-01-01", "2026-01-10", entries)).toBe(3);
    expect(longestStreak(lecturas, "2026-01-01", "2026-01-10", [])).toBe(0);
  });

  it("expresses completion as the share of completed days in the range", () => {
    const entries = [
      entry("done", "2026-01-02", true),
      entry("done", "2026-01-05", true),
      entry("done", "2026-01-09", true),
      entry("done", "2026-01-10", true),
    ];

    expect(completionRate(lecturas, "2026-01-01", "2026-01-10", entries)).toBeCloseTo(0.4);
    expect(completionRate(lecturas, "2026-01-10", "2026-01-01", entries)).toBe(0);
  });
});
