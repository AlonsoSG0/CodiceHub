import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import type { ChubDatabase } from "../db/client.js";
import { habitEntries, habitFields, habits, type HabitEntryRow, type HabitFieldRow, type HabitRow } from "../db/schema.js";

export type HabitFieldKind = "check" | "number" | "text";
/** Which surface owns a habit. The books section keeps its own reading habit out of the habits section. */
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
export type HabitField = {
  id: string;
  habitId: string;
  kind: HabitFieldKind;
  label: string;
  unit: string | null;
  target: number | null;
  position: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type HabitEntry = {
  habitId: string;
  fieldId: string;
  date: string;
  kind: HabitFieldKind;
  value: boolean | number | string;
};

export type HabitErrorCode = "habit_not_found" | "field_not_found" | "habit_not_archived" | "invalid_value" | "invalid_date";

export class HabitError extends Error {
  constructor(readonly code: HabitErrorCode) {
    super(code);
    this.name = "HabitError";
  }
}

export type CreateHabitInput = { name?: string; icon?: string | null; position?: number; section?: HabitSection };
export type UpdateHabitInput = { name?: string; icon?: string | null; archived?: boolean };
export type AddHabitFieldInput = { kind: HabitFieldKind; label?: string; unit?: string | null; target?: number | null; position?: number };
export type UpdateHabitFieldInput = { label?: string; unit?: string | null; target?: number | null; position?: number };
export type EntryValue = { fieldId: string; value: boolean | number | string | null };
type HabitEntryQuery = { from: string; to: string };

export interface HabitsRepository {
  list(input: { archived: boolean; section?: HabitSection }): Habit[];
  get(id: string): Habit;
  create(input: CreateHabitInput): Habit;
  update(id: string, input: UpdateHabitInput): Habit;
  setEntries(id: string, date: string, values: EntryValue[]): HabitEntry[];
  listEntries(input: HabitEntryQuery): HabitEntry[];
  addField(id: string, input: AddHabitFieldInput): Habit;
  updateField(id: string, fieldId: string, input: UpdateHabitFieldInput): Habit;
  removeField(id: string, fieldId: string): { habit: Habit; field: "deleted" | "archived" };
  purge(id: string): string[];
}

const now = (): string => new Date().toISOString();

/** How far ahead of the server's own calendar a client's local day may be. */
const clientDayTolerance = 1;

function isHabitFieldKind(value: string): value is HabitFieldKind {
  return value === "check" || value === "number" || value === "text";
}

function validateDate(date: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new HabitError("invalid_date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!daysInMonth || day < 1 || day > daysInMonth) throw new HabitError("invalid_date");

  // The day key belongs to the CLIENT's local calendar, so the server cannot know that calendar's exact today.
  // A browser east of the server's timezone is legitimately a day ahead of it, and refusing that day would drop a
  // real today. A day beyond the tolerance is still refused, which keeps a nonsense date out of the heatmap.
  const today = new Date();
  const latest = new Date(today.getFullYear(), today.getMonth(), today.getDate() + clientDayTolerance, 12);
  const latestDay = `${String(latest.getFullYear()).padStart(4, "0")}-${String(latest.getMonth() + 1).padStart(2, "0")}-${String(latest.getDate()).padStart(2, "0")}`;
  if (date > latestDay) throw new HabitError("invalid_date");
}

function toHabitField(row: HabitFieldRow): HabitField {
  if (!isHabitFieldKind(row.kind)) throw new Error(`stored habit field kind is invalid: ${row.kind}`);
  return {
    id: row.id,
    habitId: row.habitId,
    kind: row.kind,
    label: row.label,
    unit: row.unit,
    target: row.target,
    position: row.position,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toHabitEntry(row: HabitEntryRow, storedKind: string): HabitEntry {
  if (!isHabitFieldKind(storedKind)) throw new Error(`stored habit field kind is invalid: ${storedKind}`);
  let value: boolean | number | string;
  if (storedKind === "check") value = row.valueNum === 1;
  else if (storedKind === "number") {
    if (row.valueNum === null) throw new Error("stored number habit entry has no numeric value");
    value = row.valueNum;
  } else {
    if (row.valueText === null) throw new Error("stored text habit entry has no text value");
    value = row.valueText;
  }
  return { habitId: row.habitId, fieldId: row.fieldId, date: row.date, kind: storedKind, value };
}

export function createHabitsRepository(db: ChubDatabase): HabitsRepository {
  const requireHabit = (id: string): HabitRow => {
    const row = db.select().from(habits).where(eq(habits.id, id)).get();
    if (!row) throw new HabitError("habit_not_found");
    return row;
  };

  const requireField = (habitId: string, fieldId: string): HabitFieldRow => {
    const row = db
      .select()
      .from(habitFields)
      .where(eq(habitFields.id, fieldId))
      .get();
    if (!row || row.habitId !== habitId) throw new HabitError("field_not_found");
    return row;
  };

  const getHabit = (id: string): Habit => {
    const row = requireHabit(id);
    const fields = db
      .select()
      .from(habitFields)
      .where(eq(habitFields.habitId, id))
      .orderBy(asc(habitFields.position), asc(habitFields.id))
      .all();
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      position: row.position,
      section: row.section as HabitSection,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      fields: fields.map(toHabitField),
    };
  };

  const selectEntries = (conditions: { from?: string; to?: string; habitId?: string }): HabitEntry[] => {
    // One joined query: filtering in SQL keeps the year-long matrix read off a full table scan, and the join carries
    // each row's field kind instead of a second lookup per entry.
    const rows = db
      .select({ entry: habitEntries, kind: habitFields.kind })
      .from(habitEntries)
      .innerJoin(habitFields, eq(habitEntries.fieldId, habitFields.id))
      .where(
        and(
          conditions.from === undefined ? undefined : gte(habitEntries.date, conditions.from),
          conditions.to === undefined ? undefined : lte(habitEntries.date, conditions.to),
          conditions.habitId === undefined ? undefined : eq(habitEntries.habitId, conditions.habitId)
        )
      )
      .orderBy(asc(habitEntries.date), asc(habitEntries.habitId), asc(habitEntries.fieldId))
      .all();

    return rows.map(({ entry, kind }) => toHabitEntry(entry, kind));
  };

  return {
    list({ archived, section }): Habit[] {
      const rows = db
        .select()
        .from(habits)
        .where(
          and(
            archived ? isNotNull(habits.archivedAt) : isNull(habits.archivedAt),
            section === undefined ? undefined : eq(habits.section, section),
          ),
        )
        .orderBy(asc(habits.position), asc(habits.id))
        .all();
      return rows.map((row) => getHabit(row.id));
    },

    get: getHabit,

    create(input): Habit {
      const create = db.$client.transaction(() => {
        const section = input.section ?? "habits";
        const activePositions = db
          .$client
          .prepare("SELECT COUNT(*) AS count FROM habits WHERE archived_at IS NULL AND section = ?")
          .get(section) as { count: number };
        const timestamp = now();
        const id = randomUUID();
        db.$client
          .prepare("INSERT INTO habits (id, name, icon, position, section, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)")
          .run(
            id,
            input.name ?? "",
            input.icon ?? null,
            input.position ?? activePositions.count,
            section,
            timestamp,
            timestamp,
          );
        const fieldId = randomUUID();
        db.$client
          .prepare("INSERT INTO habit_fields (id, habit_id, kind, label, unit, target, position, archived_at, created_at, updated_at) VALUES (?, ?, 'check', 'Done', NULL, NULL, 0, NULL, ?, ?)")
          .run(fieldId, id, timestamp, timestamp);
        return getHabit(id);
      });
      return create.immediate();
    },

    update(id, input): Habit {
      const update = db.$client.transaction(() => {
        const row = requireHabit(id);
        const archivedAt = input.archived === undefined ? row.archivedAt : input.archived ? row.archivedAt ?? now() : null;
        db.$client
          .prepare("UPDATE habits SET name = ?, icon = ?, archived_at = ?, updated_at = ? WHERE id = ?")
          .run(input.name ?? row.name, input.icon === undefined ? row.icon : input.icon, archivedAt, now(), id);
        return getHabit(id);
      });
      return update.immediate();
    },

    setEntries(id, date, values): HabitEntry[] {
      validateDate(date);
      const set = db.$client.transaction(() => {
        requireHabit(id);
        const pending = values.map(({ fieldId, value }) => {
          const field = requireField(id, fieldId);
          if (value === null) return { field, value: null };
          const valid = field.kind === "check"
            ? typeof value === "boolean"
            : field.kind === "number"
              ? typeof value === "number" && Number.isFinite(value)
              : field.kind === "text" && typeof value === "string";
          if (!valid) throw new HabitError("invalid_value");
          return { field, value };
        });
        const remove = db.$client.prepare("DELETE FROM habit_entries WHERE habit_id = ? AND field_id = ? AND date = ?");
        const upsert = db.$client.prepare(
          "INSERT INTO habit_entries (habit_id, field_id, date, value_num, value_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(habit_id, field_id, date) DO UPDATE SET value_num = excluded.value_num, value_text = excluded.value_text, updated_at = excluded.updated_at"
        );
        for (const { field, value } of pending) {
          if (value === null || (field.kind === "check" && value === false)) {
            remove.run(id, field.id, date);
          } else {
            const numeric = field.kind === "check" ? (value === true ? 1 : 0) : field.kind === "number" ? value : null;
            const textual = field.kind === "text" ? value : null;
            const timestamp = now();
            upsert.run(id, field.id, date, numeric, textual, timestamp, timestamp);
          }
        }
        return selectEntries({ habitId: id, from: date, to: date });
      });
      return set.immediate();
    },

    listEntries({ from, to }): HabitEntry[] {
      validateDate(from);
      validateDate(to);
      if (from > to) throw new HabitError("invalid_date");
      return selectEntries({ from, to });
    },

    addField(id, input): Habit {
      if (!isHabitFieldKind(input.kind)) throw new HabitError("invalid_value");
      const add = db.$client.transaction(() => {
        requireHabit(id);
        const position = input.position ?? (db
          .$client
          .prepare("SELECT COALESCE(MAX(position) + 1, 0) AS position FROM habit_fields WHERE habit_id = ?")
          .get(id) as { position: number }).position;
        const timestamp = now();
        db.$client
          .prepare("INSERT INTO habit_fields (id, habit_id, kind, label, unit, target, position, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)")
          .run(randomUUID(), id, input.kind, input.label ?? "", input.unit ?? null, input.target ?? null, position, timestamp, timestamp);
        return getHabit(id);
      });
      return add.immediate();
    },

    updateField(id, fieldId, input): Habit {
      const update = db.$client.transaction(() => {
        requireHabit(id);
        const field = requireField(id, fieldId);
        db.$client
          .prepare("UPDATE habit_fields SET label = ?, unit = ?, target = ?, position = ?, updated_at = ? WHERE id = ?")
          .run(
            input.label ?? field.label,
            input.unit === undefined ? field.unit : input.unit,
            input.target === undefined ? field.target : input.target,
            input.position ?? field.position,
            now(),
            fieldId
          );
        return getHabit(id);
      });
      return update.immediate();
    },

    removeField(id, fieldId): { habit: Habit; field: "deleted" | "archived" } {
      const remove = db.$client.transaction(() => {
        requireHabit(id);
        const field = requireField(id, fieldId);
        const hasEntries = db.$client
          .prepare("SELECT 1 FROM habit_entries WHERE habit_id = ? AND field_id = ? LIMIT 1")
          .get(id, fieldId);
        const timestamp = now();
        if (hasEntries) {
          db.$client.prepare("UPDATE habit_fields SET archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ?")
            .run(timestamp, timestamp, fieldId);
          return { habit: getHabit(id), field: "archived" as const };
        }
        db.$client.prepare("DELETE FROM habit_fields WHERE id = ?").run(fieldId);
        return { habit: getHabit(id), field: "deleted" as const };
      });
      return remove.immediate();
    },

    purge(id): string[] {
      const purge = db.$client.transaction(() => {
        const row = requireHabit(id);
        if (row.archivedAt === null) throw new HabitError("habit_not_archived");
        db.$client.prepare("DELETE FROM habit_entries WHERE habit_id = ?").run(id);
        db.$client.prepare("DELETE FROM habit_fields WHERE habit_id = ?").run(id);
        db.$client.prepare("DELETE FROM habits WHERE id = ?").run(id);
        return [id];
      });
      return purge.immediate();
    },
  };
}
