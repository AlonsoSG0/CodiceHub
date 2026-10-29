import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const pageSections = sqliteTable(
  "page_sections",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("page_sections_position_idx").on(table.position)]
);

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id").references((): AnySQLiteColumn => pages.id),
    sectionId: text("section_id").references((): AnySQLiteColumn => pageSections.id, { onDelete: "set null" }),
    title: text("title").notNull().default(""),
    icon: text("icon"),
    content: text("content").notNull().default('{"type":"doc","content":[]}'),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    deletedAt: text("deleted_at"),
    favorite: integer("favorite").notNull().default(0),
  },
  (table) => [
    index("pages_parent_id_idx").on(table.parentId),
    index("pages_deleted_at_idx").on(table.deletedAt),
    index("pages_section_id_idx").on(table.sectionId),
  ]
);

export const preferences = sqliteTable("preferences", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const routineSettings = sqliteTable("routine_settings", {
  id: text("id").primaryKey(),
  weekStartsOn: integer("week_starts_on").notNull().default(1),
  dayStart: text("day_start").notNull().default("07:00"),
  dayEnd: text("day_end").notNull().default("23:00"),
  editWindowDays: integer("edit_window_days").notNull().default(7),
  updatedAt: text("updated_at").notNull(),
});
export const routineDayWindows = sqliteTable("routine_day_windows", {
  weekday: integer("weekday").primaryKey(),
  start: text("start").notNull(),
  end: text("end").notNull(),
});
export const routineDays = sqliteTable("routine_days", {
  weekday: integer("weekday").primaryKey(),
  isTemplate: integer("is_template", { mode: "boolean" }).notNull().default(false),
});
export const routineBlocks = sqliteTable("routine_blocks", {
  id: text("id").primaryKey(),
  weekday: integer("weekday").notNull(),
  title: text("title").notNull().default(""),
  start: text("start").notNull(),
  end: text("end").notNull(),
  intent: text("intent").notNull().default("must"),
  linkKind: text("link_kind"),
  linkId: text("link_id"),
  note: text("note").notNull().default(""),
  position: integer("position").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("routine_blocks_weekday_position_idx").on(table.weekday, table.position)]);
export const routineOccurrences = sqliteTable("routine_occurrences", {
  blockId: text("block_id").notNull().references(() => routineBlocks.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  status: text("status").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.blockId, table.date] }), index("routine_occurrences_date_idx").on(table.date)]);
export const routineMirrors = sqliteTable("routine_mirrors", {
  blockId: text("block_id").notNull(),
  date: text("date").notNull(),
  target: text("target").notNull(),
  targetId: text("target_id").notNull(),
  written: integer("written", { mode: "boolean" }).notNull(),
  reason: text("reason"),
}, (table) => [primaryKey({ columns: [table.blockId, table.date] })]);

export const habits = sqliteTable(
  "habits",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    icon: text("icon"),
    position: integer("position").notNull(),
    /** Which surface owns the habit: the habits section, or the books section's own reading habit. */
    section: text("section").notNull().default("habits"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    archivedAt: text("archived_at"),
  },
  (table) => [
    index("habits_archived_at_idx").on(table.archivedAt),
    index("habits_section_idx").on(table.section),
  ]
);

export const habitFields = sqliteTable(
  "habit_fields",
  {
    id: text("id").primaryKey(),
    habitId: text("habit_id")
      .notNull()
      .references(() => habits.id),
    kind: text("kind").notNull(),
    label: text("label").notNull().default(""),
    unit: text("unit"),
    target: real("target"),
    position: integer("position").notNull(),
    archivedAt: text("archived_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("habit_fields_habit_id_position_idx").on(table.habitId, table.position)]
);

export const habitEntries = sqliteTable(
  "habit_entries",
  {
    habitId: text("habit_id")
      .notNull()
      .references(() => habits.id),
    fieldId: text("field_id")
      .notNull()
      .references(() => habitFields.id),
    date: text("date").notNull(),
    valueNum: real("value_num"),
    valueText: text("value_text"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.habitId, table.fieldId, table.date] }),
    index("habit_entries_habit_id_date_idx").on(table.habitId, table.date),
  ]
);

export const books = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull().default(""),
    author: text("author"),
    score: real("score"),
    status: text("status").notNull().default("reading"),
    startDate: text("start_date"),
    completedDate: text("completed_date"),
    link: text("link"),
    expectation: text("expectation"),
    /** A cover image: an absolute URL, or the `/uploads/…` path of an uploaded file. */
    coverUrl: text("cover_url"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("books_status_idx").on(table.status)]
);

/** One notebook per book: the book's own page, with no tree of its own. */
export const bookNotebooks = sqliteTable(
  "book_notebooks",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    content: text("content").notNull().default('{"type":"doc","content":[]}'),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [uniqueIndex("book_notebooks_book_id_idx").on(table.bookId)]
);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  description: text("description"),
  archivedAt: text("archived_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const projectColumns = sqliteTable(
  "project_columns",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("project_columns_project_id_position_idx").on(table.projectId, table.position)]
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    columnId: text("column_id")
      .notNull()
      .references(() => projectColumns.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    description: text("description"),
    dueDate: text("due_date"),
    priority: text("priority").notNull().default("none"),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("tasks_column_id_position_idx").on(table.columnId, table.position),
    index("tasks_project_id_idx").on(table.projectId),
    index("tasks_due_date_idx").on(table.dueDate),
  ]
);

export const checklists = sqliteTable(
  "checklists",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("checklists_position_idx").on(table.position)]
);

export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    dueDate: text("due_date"),
    priority: text("priority").notNull().default("none"),
    recurrence: text("recurrence").notNull().default("none"),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("checklist_items_list_id_position_idx").on(table.listId, table.position)]
);

export const goalGroups = sqliteTable(
  "goal_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("goal_groups_position_idx").on(table.position), index("goal_groups_archived_at_idx").on(table.archivedAt)]
);

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => goalGroups.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default('{"type":"doc","content":[]}'),
    dueDate: text("due_date"),
    status: text("status").notNull().default("todo"),
    categoryId: text("category_id").references((): AnySQLiteColumn => categories.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("goals_group_id_position_idx").on(table.groupId, table.position),
    index("goals_category_id_idx").on(table.categoryId),
  ]
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [uniqueIndex("tags_name_idx").on(table.name)]
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [uniqueIndex("categories_name_idx").on(table.name)]
);

export const goalTags = sqliteTable(
  "goal_tags",
  {
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.goalId, table.tagId] }), index("goal_tags_tag_id_idx").on(table.tagId)]
);

export type PreferenceRow = typeof preferences.$inferSelect;
export type RoutineSettingsRow = typeof routineSettings.$inferSelect;
export type RoutineDayWindowRow = typeof routineDayWindows.$inferSelect;
export type RoutineDayRow = typeof routineDays.$inferSelect;
export type RoutineBlockRow = typeof routineBlocks.$inferSelect;
export type RoutineOccurrenceRow = typeof routineOccurrences.$inferSelect;
export type RoutineMirrorRow = typeof routineMirrors.$inferSelect;
export type PageRow = typeof pages.$inferSelect;
export type NewPageRow = typeof pages.$inferInsert;
export type HabitRow = typeof habits.$inferSelect;
export type NewHabitRow = typeof habits.$inferInsert;
export type HabitFieldRow = typeof habitFields.$inferSelect;
export type NewHabitFieldRow = typeof habitFields.$inferInsert;
export type HabitEntryRow = typeof habitEntries.$inferSelect;
export type BookRow = typeof books.$inferSelect;
export type BookNotebookRow = typeof bookNotebooks.$inferSelect;
export type NewBookRow = typeof books.$inferInsert;
export type NewHabitEntryRow = typeof habitEntries.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type ProjectColumnRow = typeof projectColumns.$inferSelect;
export type NewProjectColumnRow = typeof projectColumns.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type ChecklistRow = typeof checklists.$inferSelect;
export type ChecklistItemRow = typeof checklistItems.$inferSelect;
export type GoalGroupRow = typeof goalGroups.$inferSelect;
export type NewGoalGroupRow = typeof goalGroups.$inferInsert;
export type GoalRow = typeof goals.$inferSelect;
export type NewGoalRow = typeof goals.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
export type NewTagRow = typeof tags.$inferInsert;
export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;
export type GoalTagRow = typeof goalTags.$inferSelect;
