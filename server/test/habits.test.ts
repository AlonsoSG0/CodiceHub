import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";

const repositoryModule = await import("../src/habits/repository.js").catch(() => undefined);

describe("habits repository API", () => {
  it("exports the repository factory and error type", () => {
    expect(repositoryModule?.createHabitsRepository).toBeTypeOf("function");
    expect(repositoryModule?.HabitError).toBeTypeOf("function");
  });
});

if (repositoryModule) {
  const { createHabitsRepository, HabitError } = repositoryModule;

  describe("habits repository", () => {
    let db: ChubDatabase;
    let repo: ReturnType<typeof createHabitsRepository>;

    beforeEach(() => {
      db = createDb(join(mkdtempSync(join(tmpdir(), "chub-habits-")), "chub.db"));
      repo = createHabitsRepository(db);
    });

    afterEach(() => db?.$client.close());

    const expectCode = (operation: () => unknown, code: string) => {
      try {
        operation();
        throw new Error(`Expected HabitError with code ${code}`);
      } catch (error) {
        expect(error).toBeInstanceOf(HabitError);
        expect((error as InstanceType<typeof HabitError>).code).toBe(code);
      }
    };

    const counts = () => ({
      habits: (db.$client.prepare("SELECT COUNT(*) AS count FROM habits").get() as { count: number }).count,
      fields: (db.$client.prepare("SELECT COUNT(*) AS count FROM habit_fields").get() as { count: number }).count,
      entries: (db.$client.prepare("SELECT COUNT(*) AS count FROM habit_entries").get() as { count: number }).count,
    });

    it("creates a habit with its first Done check field", () => {
      const habit = repo.create({ name: "Read" });

      expect(habit).toMatchObject({ name: "Read", archivedAt: null, fields: [{ kind: "check", label: "Done" }] });
      expect(habit.fields).toHaveLength(1);
      expect(repo.list({ archived: false })).toEqual([habit]);
    });

    it("upserts one entry per habit, field, and date; a second write replaces it", () => {
      const habit = repo.create({ name: "Read" });
      const field = repo.addField(habit.id, { kind: "number", label: "Pages" }).fields[1]!;

      repo.setEntries(habit.id, "2025-03-04", [{ fieldId: field.id, value: 12 }]);
      const updated = repo.setEntries(habit.id, "2025-03-04", [{ fieldId: field.id, value: 19 }]);

      expect(updated).toEqual([{ habitId: habit.id, fieldId: field.id, date: "2025-03-04", kind: "number", value: 19 }]);
      expect(repo.listEntries({ from: "2025-03-04", to: "2025-03-04" })).toEqual(updated);
      expect(counts().entries).toBe(1);
    });

    it("deletes an entry when its value is null", () => {
      const habit = repo.create({});
      const field = habit.fields[0]!;
      repo.setEntries(habit.id, "2025-03-04", [{ fieldId: field.id, value: true }]);

      expect(repo.setEntries(habit.id, "2025-03-04", [{ fieldId: field.id, value: null }])).toEqual([]);
      expect(counts().entries).toBe(0);
    });

    it("treats an unchecked check value as absence rather than storing false", () => {
      const habit = repo.create({});
      const check = habit.fields[0]!;
      repo.setEntries(habit.id, "2025-03-04", [{ fieldId: check.id, value: true }]);

      expect(repo.setEntries(habit.id, "2025-03-04", [{ fieldId: check.id, value: false }])).toEqual([]);
      expect(counts().entries).toBe(0);
    });

    it("rejects invalid calendar dates without writing an entry", () => {
      const habit = repo.create({});
      const check = habit.fields[0]!;

      vi.useFakeTimers();
      try {
        // The day key belongs to the browser's calendar, so a browser east of the server's timezone is legitimately
        // one day ahead of it; a day beyond that tolerance is still refused.
        vi.setSystemTime(new Date(2026, 0, 5, 23, 30));
        expect(repo.setEntries(habit.id, "2026-01-06", [{ fieldId: check.id, value: true }])).toHaveLength(1);
        expectCode(
          () => repo.setEntries(habit.id, "2026-01-07", [{ fieldId: check.id, value: true }]),
          "invalid_date"
        );

        expectCode(() => repo.setEntries(habit.id, "2025-02-29", [{ fieldId: check.id, value: true }]), "invalid_date");
        expectCode(() => repo.setEntries(habit.id, "2025-3-04", [{ fieldId: check.id, value: true }]), "invalid_date");
        expectCode(() => repo.setEntries(habit.id, "", [{ fieldId: check.id, value: true }]), "invalid_date");
      } finally {
        vi.useRealTimers();
      }

      // Only the one accepted day was written; every refused day left the counters alone.
      expect(counts().entries).toBe(1);
    });

    it("rejects a wrong value type without changing entries or row counts", () => {
      const habit = repo.create({});
      const field = repo.addField(habit.id, { kind: "number", label: "Pages" }).fields[1]!;
      repo.setEntries(habit.id, "2025-03-04", [{ fieldId: field.id, value: 12 }]);
      const beforeRows = db.$client.prepare("SELECT * FROM habit_entries ORDER BY habit_id, field_id, date").all();
      const beforeCounts = counts();

      expectCode(
        () => repo.setEntries(habit.id, "2025-03-04", [{ fieldId: field.id, value: "twelve" }]),
        "invalid_value"
      );

      expect(db.$client.prepare("SELECT * FROM habit_entries ORDER BY habit_id, field_id, date").all()).toEqual(beforeRows);
      expect(counts()).toEqual(beforeCounts);
    });

    it("purge refuses an active habit and removes an archived habit with its fields and entries", () => {
      const habit = repo.create({ name: "Read" });
      const check = habit.fields[0]!;
      repo.setEntries(habit.id, "2025-03-04", [{ fieldId: check.id, value: true }]);

      expectCode(() => repo.purge(habit.id), "habit_not_archived");
      expect(counts()).toEqual({ habits: 1, fields: 1, entries: 1 });

      repo.update(habit.id, { archived: true });
      expect(repo.purge(habit.id)).toEqual([habit.id]);
      expect(counts()).toEqual({ habits: 0, fields: 0, entries: 0 });
      expectCode(() => repo.get(habit.id), "habit_not_found");
    });

    it("clears archivedAt when a habit is unarchived", () => {
      const habit = repo.create({ name: "Read" });
      expect(repo.update(habit.id, { archived: true }).archivedAt).toEqual(expect.any(String));
      expect(repo.update(habit.id, { archived: false }).archivedAt).toBeNull();
    });

    it("archives a field with entries and deletes an empty field", () => {
      const habit = repo.create({});
      const check = habit.fields[0]!;
      const withEntries = repo.addField(habit.id, { kind: "text", label: "Note" }).fields[1]!;
      const empty = repo.addField(habit.id, { kind: "number", label: "Pages" }).fields[2]!;
      repo.setEntries(habit.id, "2025-03-04", [{ fieldId: withEntries.id, value: "chapter one" }]);

      expect(repo.removeField(habit.id, withEntries.id).field).toBe("archived");
      expect(repo.get(habit.id).fields.find(({ id }) => id === withEntries.id)?.archivedAt).toEqual(expect.any(String));
      expect(repo.removeField(habit.id, empty.id).field).toBe("deleted");
      expect(repo.get(habit.id).fields.map(({ id }) => id)).toEqual([check.id, withEntries.id]);
    });

    it("does not allow a field belonging to another habit to be written through this habit id", () => {
      const first = repo.create({ name: "First" });
      const second = repo.create({ name: "Second" });
      const foreignField = second.fields[0]!;
      const beforeCounts = counts();

      expectCode(
        () => repo.setEntries(first.id, "2025-03-04", [{ fieldId: foreignField.id, value: true }]),
        "field_not_found"
      );
      expect(counts()).toEqual(beforeCounts);
    });
  });
}
