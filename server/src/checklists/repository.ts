import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { ChubDatabase } from "../db/client.js";
import { checklistItems, checklists, goals, type ChecklistItemRow, type ChecklistRow } from "../db/schema.js";

export type ChecklistPriority = "none" | "low" | "medium" | "high" | "now";

export type ChecklistRecurrence = "none" | "daily" | "weekly";

export type ChecklistBulkAction = "complete-open" | "delete-completed";

const priorities: ReadonlySet<string> = new Set(["none", "low", "medium", "high", "now"]);
const recurrences: ReadonlySet<string> = new Set(["none", "daily", "weekly"]);
const bulkActions: ReadonlySet<string> = new Set(["complete-open", "delete-completed"]);

export type ChecklistItem = {
  id: string;
  listId: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  priority: ChecklistPriority;
  recurrence: ChecklistRecurrence;
  goalId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type Checklist = {
  id: string;
  name: string;
  position: number;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
};

export type UpdateChecklistItemInput = {
  text?: string;
  done?: boolean;
  dueDate?: string | null;
  priority?: ChecklistPriority;
  recurrence?: ChecklistRecurrence;
  goalId?: string | null;
};

export type ChecklistPrunePolicy = { olderThanDays: number; scope: "all" | "completed" };

export type ChecklistPruneResult = { deletedItems: number; deletedGroups: number };

export type ChecklistErrorCode =
  | "checklist_not_found"
  | "item_not_found"
  | "invalid_name"
  | "invalid_text"
  | "invalid_done"
  | "invalid_retention"
  | "invalid_scope"
  | "invalid_due_date"
  | "invalid_priority"
  | "invalid_recurrence"
  | "invalid_action"
  | "invalid_goal";

export class ChecklistError extends Error {
  constructor(readonly code: ChecklistErrorCode) {
    super(code);
    this.name = "ChecklistError";
  }
}

export interface ChecklistsRepository {
  listChecklists(): Checklist[];
  createChecklist(name: string): Checklist;
  renameChecklist(id: string, name: string): Checklist;
  removeChecklist(id: string): void;
  addItem(listId: string, text: string): ChecklistItem;
  updateItem(id: string, input: UpdateChecklistItemInput): ChecklistItem;
  removeItem(id: string): void;
  prune(policy: ChecklistPrunePolicy): ChecklistPruneResult;
  bulk(listId: string, action: ChecklistBulkAction): Checklist;
}

function now(): string {
  return new Date().toISOString();
}

function validateName(name: string): void {
  if (typeof name !== "string" || name.trim().length === 0) throw new ChecklistError("invalid_name");
}

function validateText(text: string): void {
  if (typeof text !== "string" || text.trim().length === 0) throw new ChecklistError("invalid_text");
}

/** A due date is a local calendar day, never an instant; the roundtrip rejects 2026-02-31. */
function validateDueDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new ChecklistError("invalid_due_date");
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new ChecklistError("invalid_due_date");
  }
}

function validatePriority(value: string): void {
  if (!priorities.has(value)) throw new ChecklistError("invalid_priority");
}

function validateRecurrence(value: string): void {
  if (!recurrences.has(value)) throw new ChecklistError("invalid_recurrence");
}

/** Whole-day arithmetic on the stored calendar day, never on an instant. */
function addDays(key: string, days: number): string {
  const date = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toItem(row: ChecklistItemRow): ChecklistItem {
  return {
    id: row.id,
    listId: row.listId,
    text: row.text,
    done: row.done,
    dueDate: row.dueDate,
    priority: row.priority as ChecklistPriority,
    recurrence: row.recurrence as ChecklistRecurrence,
    goalId: row.goalId,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toChecklist(row: ChecklistRow, items: ChecklistItem[]): Checklist {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createChecklistsRepository(db: ChubDatabase): ChecklistsRepository {
  const requireChecklist = (id: string): ChecklistRow => {
    const row = db.select().from(checklists).where(eq(checklists.id, id)).get();
    if (!row) throw new ChecklistError("checklist_not_found");
    return row;
  };

  const requireItem = (id: string): ChecklistItemRow => {
    const row = db.select().from(checklistItems).where(eq(checklistItems.id, id)).get();
    if (!row) throw new ChecklistError("item_not_found");
    return row;
  };

  const itemsFor = (listId: string): ChecklistItem[] =>
    db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.listId, listId))
      .orderBy(asc(checklistItems.position), asc(checklistItems.id))
      .all()
      .map(toItem);

  const getChecklist = (id: string): Checklist => {
    const row = requireChecklist(id);
    return toChecklist(row, itemsFor(id));
  };

  const nextPosition = (listId: string): number =>
    (
      db.$client
        .prepare("SELECT COALESCE(MAX(position) + 1, 0) AS position FROM checklist_items WHERE list_id = ?")
        .get(listId) as { position: number }
    ).position;

  const spawnNextOccurrence = (
    listId: string,
    next: { text: string; dueDate: string; priority: ChecklistPriority; recurrence: ChecklistRecurrence }
  ): void => {
    const timestamp = now();
    db.$client
      .prepare(
        "INSERT INTO checklist_items (id, list_id, text, done, due_date, priority, recurrence, position, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)"
      )
      .run(randomUUID(), listId, next.text, next.dueDate, next.priority, next.recurrence, nextPosition(listId), timestamp, timestamp);
  };

  return {
    listChecklists(): Checklist[] {
      const rows = db.select().from(checklists).orderBy(asc(checklists.position), asc(checklists.id)).all();
      const items = db.select().from(checklistItems).orderBy(asc(checklistItems.position), asc(checklistItems.id)).all();
      const itemsByList = new Map<string, ChecklistItem[]>();
      for (const item of items) {
        const listItems = itemsByList.get(item.listId) ?? [];
        listItems.push(toItem(item));
        itemsByList.set(item.listId, listItems);
      }
      return rows.map((row) => toChecklist(row, itemsByList.get(row.id) ?? []));
    },

    createChecklist(name): Checklist {
      validateName(name);
      const create = db.$client.transaction(() => {
        const position = (
          db.$client.prepare("SELECT COALESCE(MAX(position) + 1, 0) AS position FROM checklists").get() as {
            position: number;
          }
        ).position;
        const id = randomUUID();
        const timestamp = now();
        db.$client
          .prepare("INSERT INTO checklists (id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
          .run(id, name, position, timestamp, timestamp);
        return getChecklist(id);
      });
      return create.immediate();
    },

    renameChecklist(id, name): Checklist {
      validateName(name);
      const rename = db.$client.transaction(() => {
        requireChecklist(id);
        db.$client.prepare("UPDATE checklists SET name = ?, updated_at = ? WHERE id = ?").run(name, now(), id);
        return getChecklist(id);
      });
      return rename.immediate();
    },

    removeChecklist(id): void {
      const remove = db.$client.transaction(() => {
        requireChecklist(id);
        db.$client.prepare("DELETE FROM checklists WHERE id = ?").run(id);
      });
      remove.immediate();
    },

    addItem(listId, text): ChecklistItem {
      validateText(text);
      const add = db.$client.transaction(() => {
        requireChecklist(listId);
        const position = (
          db.$client
            .prepare("SELECT COALESCE(MAX(position) + 1, 0) AS position FROM checklist_items WHERE list_id = ?")
            .get(listId) as { position: number }
        ).position;
        const id = randomUUID();
        const timestamp = now();
        db.$client
          .prepare(
            "INSERT INTO checklist_items (id, list_id, text, done, position, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)"
          )
          .run(id, listId, text, position, timestamp, timestamp);
        return toItem(requireItem(id));
      });
      return add.immediate();
    },

    updateItem(id, input): ChecklistItem {
      if (input.text !== undefined) validateText(input.text);
      if (input.done !== undefined && typeof input.done !== "boolean") throw new ChecklistError("invalid_done");
      if (input.dueDate !== undefined && input.dueDate !== null) validateDueDate(input.dueDate);
      if (input.priority !== undefined) validatePriority(input.priority);
      if (input.recurrence !== undefined) validateRecurrence(input.recurrence);
      if (input.goalId !== undefined && input.goalId !== null) {
        const goal = db.select({ id: goals.id }).from(goals).where(eq(goals.id, input.goalId)).get();
        if (!goal) throw new ChecklistError("invalid_goal");
      }
      const update = db.$client.transaction(() => {
        const row = requireItem(id);
        const dueDate = input.dueDate === undefined ? row.dueDate : input.dueDate;
        const recurrence: ChecklistRecurrence = (input.recurrence === undefined ? row.recurrence : input.recurrence) as ChecklistRecurrence;
        const done = input.done === undefined ? row.done : input.done;

        // A repeating check needs a day to repeat from, and the next one is only born on completion.
        if (recurrence !== "none" && dueDate === null) throw new ChecklistError("invalid_recurrence");

        db.$client
          .prepare("UPDATE checklist_items SET text = ?, done = ?, due_date = ?, priority = ?, recurrence = ?, goal_id = ?, updated_at = ? WHERE id = ?")
          .run(
            input.text === undefined ? row.text : input.text,
            Number(done),
            dueDate,
            input.priority === undefined ? row.priority : input.priority,
            recurrence,
            input.goalId === undefined ? row.goalId : input.goalId,
            now(),
            id
          );

        if (done && !row.done && recurrence !== "none" && dueDate !== null) {
          spawnNextOccurrence(row.listId, {
            text: input.text === undefined ? row.text : input.text,
            dueDate: addDays(dueDate, recurrence === "daily" ? 1 : 7),
            priority: (input.priority === undefined ? row.priority : input.priority) as ChecklistPriority,
            recurrence,
          });
          // The finished check stops being the recurring one; the chain continues in the clone.
          db.$client.prepare("UPDATE checklist_items SET recurrence = 'none' WHERE id = ?").run(id);
        }

        return toItem(requireItem(id));
      });
      return update.immediate();
    },

    removeItem(id): void {
      const remove = db.$client.transaction(() => {
        requireItem(id);
        db.$client.prepare("DELETE FROM checklist_items WHERE id = ?").run(id);
      });
      remove.immediate();
    },

    /** Two intentions that are tedious row by row: close everything open, or clear the finished ones. */
    bulk(listId, action): Checklist {
      if (!bulkActions.has(action)) throw new ChecklistError("invalid_action");
      const run = db.$client.transaction(() => {
        requireChecklist(listId);
        if (action === "complete-open") {
          const open = db
            .select()
            .from(checklistItems)
            .where(and(eq(checklistItems.listId, listId), eq(checklistItems.done, false)))
            .all();
          for (const row of open) {
            if (row.recurrence !== "none" && row.dueDate !== null) {
              spawnNextOccurrence(listId, {
                text: row.text,
                dueDate: addDays(row.dueDate, row.recurrence === "daily" ? 1 : 7),
                priority: row.priority as ChecklistPriority,
                recurrence: row.recurrence as ChecklistRecurrence,
              });
            }
          }
          db.$client
            .prepare("UPDATE checklist_items SET done = 1, recurrence = 'none', updated_at = ? WHERE list_id = ? AND done = 0")
            .run(now(), listId);
        } else {
          db.$client
            .prepare("DELETE FROM checklist_items WHERE list_id = ? AND done = 1")
            .run(listId);
        }
        return getChecklist(listId);
      });
      return run.immediate();
    },

    /**
     * Removes checks older than the retention window and then the groups left with no checks.
     * "completed" only takes rows that are already done, which is what keeps the list honest about
     * what is still open; "all" is a hard retention policy.
     */
    prune({ olderThanDays, scope }): ChecklistPruneResult {
      if (!Number.isInteger(olderThanDays) || olderThanDays < 1) throw new ChecklistError("invalid_retention");
      if (scope !== "all" && scope !== "completed") throw new ChecklistError("invalid_scope");

      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
      const prune = db.$client.transaction(() => {
        const deletedItems = scope === "completed"
          ? db.$client.prepare("DELETE FROM checklist_items WHERE created_at < ? AND done = 1").run(cutoff).changes
          : db.$client.prepare("DELETE FROM checklist_items WHERE created_at < ?").run(cutoff).changes;
        const deletedGroups = db.$client
          .prepare("DELETE FROM checklists WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE list_id = checklists.id)")
          .run().changes;
        return { deletedItems, deletedGroups };
      });
      return prune.immediate();
    },
  };
}
