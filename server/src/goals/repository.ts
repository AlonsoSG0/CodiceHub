import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { ChubDatabase } from "../db/client.js";
import {
  categories,
  goalGroups,
  goals,
  tags,
  type CategoryRow,
  type GoalGroupRow,
  type GoalRow,
  type TagRow,
} from "../db/schema.js";

export type GoalTag = { id: string; name: string };
export type GoalCategory = { id: string; name: string };

export type GoalStatus = "todo" | "doing" | "done";

const goalStatuses: ReadonlySet<string> = new Set(["todo", "doing", "done"]);

export type GoalSummary = {
  id: string;
  groupId: string;
  title: string;
  category: GoalCategory | null;
  tags: GoalTag[];
  dueDate: string | null;
  status: GoalStatus;
  position: number;
  updatedAt: string;
};

export type Goal = GoalSummary & { content: unknown; createdAt: string };

export type GoalGroup = {
  id: string;
  name: string;
  position: number;
  periodStart: string | null;
  periodEnd: string | null;
  archivedAt: string | null;
  goals: GoalSummary[];
  createdAt: string;
  updatedAt: string;
};

export type UpdateGoalGroupInput = {
  name?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  archived?: boolean;
  position?: number;
};

export type GoalVocabulary = { tags: GoalTag[]; categories: GoalCategory[] };
export type UpdateGoalInput = {
  title?: string;
  content?: unknown;
  categoryName?: string | null;
  tagNames?: string[];
  dueDate?: string | null;
  status?: GoalStatus;
};

export type GoalErrorCode =
  | "group_not_found"
  | "goal_not_found"
  | "invalid_name"
  | "invalid_title"
  | "invalid_content"
  | "invalid_tags"
  | "invalid_category"
  | "invalid_period"
  | "invalid_archived"
  | "group_archived"
  | "invalid_status"
  | "invalid_due_date"
  | "invalid_position";

export class GoalError extends Error {
  constructor(readonly code: GoalErrorCode) {
    super(code);
    this.name = "GoalError";
  }
}

export interface GoalsRepository {
  listGoalGroups(archived?: boolean): GoalGroup[];
  createGroup(name: string, period?: { periodStart?: string | null; periodEnd?: string | null }): GoalGroup;
  updateGroup(id: string, input: UpdateGoalGroupInput): GoalGroup;
  removeGroup(id: string): void;
  createGoal(groupId: string, title: string): Goal;
  getGoal(id: string): Goal;
  updateGoal(id: string, input: UpdateGoalInput): Goal;
  removeGoal(id: string): void;
  getVocabulary(): GoalVocabulary;
}

function now(): string {
  return new Date().toISOString();
}

/** A period is two optional local days in order; a goal group can be open-ended on either side. */
function validateGoalStatus(status: string): void {
  if (!goalStatuses.has(status)) throw new GoalError("invalid_status");
}

function validateDueDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new GoalError("invalid_due_date");
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new GoalError("invalid_due_date");
  }
}

function validatePeriod(start: string | null, end: string | null): void {
  for (const value of [start, end]) {
    if (value === null) continue;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null) throw new GoalError("invalid_period");
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new GoalError("invalid_period");
    }
  }
  if (start !== null && end !== null && start > end) throw new GoalError("invalid_period");
}

function validateName(name: string): void {
  if (typeof name !== "string" || name.trim().length === 0) throw new GoalError("invalid_name");
}

function validateTitle(title: string): void {
  if (typeof title !== "string" || title.trim().length === 0) throw new GoalError("invalid_title");
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  return (trimmed.startsWith("#") ? trimmed.slice(1) : trimmed).trim().toLowerCase();
}

function serializeContent(content: unknown): string {
  try {
    const serialized = JSON.stringify(content);
    if (serialized === undefined) throw new GoalError("invalid_content");
    return serialized;
  } catch {
    throw new GoalError("invalid_content");
  }
}

function toTag(row: Pick<TagRow, "id" | "name">): GoalTag {
  return { id: row.id, name: row.name };
}

function toCategory(row: Pick<CategoryRow, "id" | "name">): GoalCategory {
  return { id: row.id, name: row.name };
}

export function createGoalsRepository(db: ChubDatabase): GoalsRepository {
  const requireGroup = (id: string): GoalGroupRow => {
    const row = db.select().from(goalGroups).where(eq(goalGroups.id, id)).get();
    if (!row) throw new GoalError("group_not_found");
    return row;
  };

  const requireGoal = (id: string): GoalRow => {
    const row = db.select().from(goals).where(eq(goals.id, id)).get();
    if (!row) throw new GoalError("goal_not_found");
    return row;
  };

  const categoryFor = (id: string | null): GoalCategory | null => {
    if (id === null) return null;
    const row = db.select().from(categories).where(eq(categories.id, id)).get();
    return row === undefined ? null : toCategory(row);
  };

  const tagsFor = (goalId: string): GoalTag[] =>
    (db.$client
      .prepare(
        "SELECT tags.id AS id, tags.name AS name FROM goal_tags INNER JOIN tags ON tags.id = goal_tags.tag_id WHERE goal_tags.goal_id = ? ORDER BY tags.name, tags.id",
      )
      .all(goalId) as Array<{ id: string; name: string }>).map(toTag);

  const toSummary = (row: GoalRow): GoalSummary => ({
    id: row.id,
    groupId: row.groupId,
    title: row.title,
    category: categoryFor(row.categoryId),
    tags: tagsFor(row.id),
    dueDate: row.dueDate,
    status: row.status as GoalStatus,
    position: row.position,
    updatedAt: row.updatedAt,
  });

  const goalsForGroup = (groupId: string): GoalSummary[] =>
    db
      .select()
      .from(goals)
      .where(eq(goals.groupId, groupId))
      .orderBy(asc(goals.position), asc(goals.id))
      .all()
      .map(toSummary);

  const toGroup = (row: GoalGroupRow): GoalGroup => ({
    id: row.id,
    name: row.name,
    position: row.position,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    archivedAt: row.archivedAt,
    goals: goalsForGroup(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  const getGoal = (id: string): Goal => {
    const row = requireGoal(id);
    let content: unknown;
    try {
      content = JSON.parse(row.content) as unknown;
    } catch (cause) {
      throw new Error("stored goal content is invalid JSON", { cause });
    }
    return { ...toSummary(row), content, createdAt: row.createdAt };
  };

  const appendPosition = (table: "goal_groups" | "goals", groupId?: string): number => {
    if (table === "goal_groups") {
      return (
        db.$client.prepare("SELECT COALESCE(MAX(position) + 1, 0) AS position FROM goal_groups").get() as {
          position: number;
        }
      ).position;
    }
    return (
      db.$client
        .prepare("SELECT COALESCE(MAX(position) + 1, 0) AS position FROM goals WHERE group_id = ?")
        .get(groupId) as { position: number }
    ).position;
  };

  const existingName = <T extends TagRow | CategoryRow>(
    table: "tags" | "categories",
    normalized: string,
  ): T | undefined => {
    const rows = table === "tags" ? db.select().from(tags).all() : db.select().from(categories).all();
    return rows.find((row) => row.name.toLowerCase() === normalized) as T | undefined;
  };

  const ensureTag = (normalized: string): TagRow => {
    const existing = existingName<TagRow>("tags", normalized);
    if (existing) return existing;
    const id = randomUUID();
    const timestamp = now();
    db.$client
      .prepare("INSERT INTO tags (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, normalized, timestamp, timestamp);
    return db.select().from(tags).where(eq(tags.id, id)).get()!;
  };

  const ensureCategory = (normalized: string): CategoryRow => {
    const existing = existingName<CategoryRow>("categories", normalized);
    if (existing) return existing;
    const id = randomUUID();
    const timestamp = now();
    db.$client
      .prepare("INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, normalized, timestamp, timestamp);
    return db.select().from(categories).where(eq(categories.id, id)).get()!;
  };

  return {
    listGoalGroups(archived = false): GoalGroup[] {
      return db
        .select()
        .from(goalGroups)
        .orderBy(asc(goalGroups.position), asc(goalGroups.id))
        .all()
        .filter((row) => (archived ? row.archivedAt !== null : row.archivedAt === null))
        .map(toGroup);
    },

    createGroup(name, period = {}): GoalGroup {
      validateName(name);
      validatePeriod(period.periodStart ?? null, period.periodEnd ?? null);
      const create = db.$client.transaction(() => {
        const id = randomUUID();
        const timestamp = now();
        db.$client
          .prepare("INSERT INTO goal_groups (id, name, position, period_start, period_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(id, name, appendPosition("goal_groups"), period.periodStart ?? null, period.periodEnd ?? null, timestamp, timestamp);
        return toGroup(requireGroup(id));
      });
      return create.immediate();
    },

    updateGroup(id, input): GoalGroup {
      if (input.name !== undefined) validateName(input.name);
      if (input.position !== undefined && (!Number.isInteger(input.position) || input.position < 0)) {
        throw new GoalError("invalid_position");
      }
      const update = db.$client.transaction(() => {
        const row = requireGroup(id);
        const periodStart = input.periodStart === undefined ? row.periodStart : input.periodStart;
        const periodEnd = input.periodEnd === undefined ? row.periodEnd : input.periodEnd;
        if (input.periodStart !== undefined || input.periodEnd !== undefined) validatePeriod(periodStart, periodEnd);

        db.$client
          .prepare("UPDATE goal_groups SET name = ?, period_start = ?, period_end = ?, archived_at = ?, position = ?, updated_at = ? WHERE id = ?")
          .run(
            input.name === undefined ? row.name : input.name,
            periodStart,
            periodEnd,
            input.archived === undefined ? row.archivedAt : (input.archived ? now() : null),
            input.position === undefined ? row.position : input.position,
            now(),
            id
          );
        return toGroup(requireGroup(id));
      });
      return update.immediate();
    },

    removeGroup(id): void {
      const remove = db.$client.transaction(() => {
        requireGroup(id);
        db.$client.prepare("DELETE FROM goal_groups WHERE id = ?").run(id);
      });
      remove.immediate();
    },

    createGoal(groupId, title): Goal {
      validateTitle(title);
      const create = db.$client.transaction(() => {
        const group = requireGroup(groupId);
        if (group.archivedAt !== null) throw new GoalError("group_archived");
        const id = randomUUID();
        const timestamp = now();
        db.$client
          .prepare(
            "INSERT INTO goals (id, group_id, title, content, category_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)",
          )
          .run(id, groupId, title, '{"type":"doc","content":[]}', appendPosition("goals", groupId), timestamp, timestamp);
        return getGoal(id);
      });
      return create.immediate();
    },

    getGoal,

    updateGoal(id, input): Goal {
      if (input.title !== undefined) validateTitle(input.title);
      const serializedContent = input.content === undefined ? undefined : serializeContent(input.content);
      if (
        input.categoryName !== undefined &&
        input.categoryName !== null &&
        typeof input.categoryName !== "string"
      ) {
        throw new GoalError("invalid_category");
      }
      if (input.tagNames !== undefined && (!Array.isArray(input.tagNames) || input.tagNames.some((name) => typeof name !== "string"))) {
        throw new GoalError("invalid_tags");
      }
      if (input.dueDate !== undefined && input.dueDate !== null) validateDueDate(input.dueDate);
      if (input.status !== undefined) validateGoalStatus(input.status);

      const normalizedTags =
        input.tagNames === undefined
          ? undefined
          : [...new Set(input.tagNames.map(normalizeName).filter((name) => name.length > 0))];
      const update = db.$client.transaction(() => {
        const row = requireGoal(id);
        let categoryId = row.categoryId;
        if (input.categoryName === null || input.categoryName === "") {
          categoryId = null;
        } else if (typeof input.categoryName === "string") {
          const normalizedCategory = normalizeName(input.categoryName);
          if (normalizedCategory.length > 0) categoryId = ensureCategory(normalizedCategory).id;
        }

        if (normalizedTags !== undefined) {
          const tagRows = normalizedTags.map(ensureTag);
          db.$client.prepare("DELETE FROM goal_tags WHERE goal_id = ?").run(id);
          const insertTag = db.$client.prepare("INSERT INTO goal_tags (goal_id, tag_id) VALUES (?, ?)");
          for (const tag of tagRows) insertTag.run(id, tag.id);
        }

        const title = input.title === undefined ? row.title : input.title;
        const content = serializedContent === undefined ? row.content : serializedContent;
        const noInput =
          input.title === undefined &&
          input.content === undefined &&
          input.categoryName === undefined &&
          input.tagNames === undefined &&
          input.dueDate === undefined &&
          input.status === undefined;
        if (noInput) return getGoal(id);

        db.$client
          .prepare("UPDATE goals SET title = ?, content = ?, category_id = ?, due_date = ?, status = ?, updated_at = ? WHERE id = ?")
          .run(
            title,
            content,
            categoryId,
            input.dueDate === undefined ? row.dueDate : input.dueDate,
            input.status === undefined ? row.status : input.status,
            now(),
            id,
          );
        return getGoal(id);
      });
      return update.immediate();
    },

    removeGoal(id): void {
      const remove = db.$client.transaction(() => {
        requireGoal(id);
        db.$client.prepare("DELETE FROM goals WHERE id = ?").run(id);
      });
      remove.immediate();
    },

    getVocabulary(): GoalVocabulary {
      return {
        tags: db.select().from(tags).orderBy(asc(tags.name), asc(tags.id)).all().map(toTag),
        categories: db.select().from(categories).orderBy(asc(categories.name), asc(categories.id)).all().map(toCategory),
      };
    },
  };
}
