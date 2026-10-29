import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";

const drizzleFolder = fileURLToPath(new URL("../drizzle/", import.meta.url));
const temporaryDirectories: string[] = [];

function newDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "chub-migrations-"));
  temporaryDirectories.push(directory);
  return join(directory, "chub.db");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function withClient<T>(path: string, run: (client: Database.Database) => T): T {
  const client = new Database(path, { readonly: true });
  try {
    return run(client);
  } finally {
    client.close();
  }
}

const columnsOf = (path: string): string[] =>
  withClient(path, (client) => (client.pragma("table_info(pages)") as Array<{ name: string }>).map((row) => row.name));

const userVersionOf = (path: string): number =>
  withClient(path, (client) => client.pragma("user_version", { simple: true }) as number);

/** Reproduces what the previous migration runner left behind: `0000` applied, no `icon` column. */
function seedPreviousRunnerDatabase(path: string): void {
  const sql = readFileSync(join(drizzleFolder, "0000_tiny_morph.sql"), "utf8");
  const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
  const client = new Database(path);
  try {
    for (const statement of statements) client.exec(statement);
    client.pragma("user_version = 1");
  } finally {
    client.close();
  }
}

describe("database migrations", () => {
  it("applies every journal entry in order on a fresh database", () => {
    const path = newDatabasePath();

    createDb(path).$client.close();

    expect(columnsOf(path)).toContain("icon");
    expect(columnsOf(path)).toContain("favorite");
    expect(columnsOf(path)).toContain("section_id");
    expect(userVersionOf(path)).toBe(22);
  });

  it("leaves an up-to-date database alone when it is opened again", () => {
    const path = newDatabasePath();
    createDb(path).$client.close();

    // A second open must not re-run a journal entry: re-running `0000` would throw on the existing table.
    const reopened = createDb(path);
    reopened.$client.exec("INSERT INTO pages (id, title, position) VALUES ('kept', 'kept', 0)");
    reopened.$client.close();

    expect(userVersionOf(path)).toBe(22);
    expect(columnsOf(path)).toContain("icon");
    expect(withClient(path, (client) => client.prepare("SELECT title FROM pages WHERE id = 'kept'").get())).toEqual({
      title: "kept",
    });
  });

  it("adds the icon column to a database from the previous runner without re-running 0000", () => {
    const path = newDatabasePath();
    seedPreviousRunnerDatabase(path);
    expect(columnsOf(path)).not.toContain("icon");
    expect(userVersionOf(path)).toBe(1);

    const upgraded = createDb(path);
    upgraded.$client.exec("INSERT INTO pages (id, title, position) VALUES ('legacy', 'survivor', 0)");
    upgraded.$client.close();

    expect(columnsOf(path)).toContain("icon");
    expect(userVersionOf(path)).toBe(22);
    withClient(path, (client) => {
      // The pre-upgrade row survived, so the old table was not recreated.
      expect(client.prepare("SELECT title FROM pages WHERE id = 'legacy'").get()).toEqual({ title: "survivor" });
      expect(client.pragma("foreign_key_check")).toEqual([]);
    });
  });

  it("adds the checklist tables to a version-8 database without touching existing rows", () => {
    const path = newDatabasePath();
    const client = new Database(path);
    try {
      const journal = JSON.parse(readFileSync(join(drizzleFolder, "meta/_journal.json"), "utf8")) as {
        entries: Array<{ idx: number; tag: string }>;
      };
      for (const entry of journal.entries.filter(({ idx }) => idx < 8)) {
        const sql = readFileSync(join(drizzleFolder, `${entry.tag}.sql`), "utf8");
        for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
          client.exec(statement);
        }
        client.pragma(`user_version = ${entry.idx + 1}`);
      }
      client.pragma("foreign_keys = ON");
      client.exec(`
        INSERT INTO pages (id, title, position) VALUES ('page', 'Page', 0);
        INSERT INTO projects (id, name) VALUES ('project', 'Project');
        INSERT INTO project_columns (id, project_id, name, position) VALUES ('column', 'project', 'Backlog', 0);
        INSERT INTO tasks (id, project_id, column_id, title, position) VALUES ('task', 'project', 'column', 'Task', 0);
        INSERT INTO habits (id, name, position) VALUES ('habit', 'Habit', 0);
      `);
    } finally {
      client.close();
    }

    expect(userVersionOf(path)).toBe(8);

    createDb(path).$client.close();

    expect(userVersionOf(path)).toBe(22);
    withClient(path, (database) => {
      const tableNames = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(tableNames).toEqual(expect.arrayContaining(["checklists", "checklist_items"]));
      expect(database.prepare("SELECT title FROM pages WHERE id = 'page'").get()).toEqual({ title: "Page" });
      expect(database.prepare("SELECT title FROM tasks WHERE id = 'task'").get()).toEqual({ title: "Task" });
      expect(database.prepare("SELECT name FROM habits WHERE id = 'habit'").get()).toEqual({ name: "Habit" });
      expect(database.pragma("foreign_key_check")).toEqual([]);
    });
  });

  it("adds only the goal tables to a version-9 database without touching existing rows", () => {
    const path = newDatabasePath();
    const client = new Database(path);
    let existingTableNames: string[] = [];
    try {
      const journal = JSON.parse(readFileSync(join(drizzleFolder, "meta/_journal.json"), "utf8")) as {
        entries: Array<{ idx: number; tag: string }>;
      };
      for (const entry of journal.entries.filter(({ idx }) => idx <= 8)) {
        const sql = readFileSync(join(drizzleFolder, `${entry.tag}.sql`), "utf8");
        for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
          client.exec(statement);
        }
        client.pragma(`user_version = ${entry.idx + 1}`);
      }
      client.pragma("foreign_keys = ON");
      client.exec(`
        INSERT INTO pages (id, title, position) VALUES ('legacy-page', 'Page', 0);
        INSERT INTO projects (id, name) VALUES ('legacy-project', 'Project');
        INSERT INTO project_columns (id, project_id, name, position) VALUES ('legacy-column', 'legacy-project', 'Backlog', 0);
        INSERT INTO tasks (id, project_id, column_id, title, position) VALUES ('legacy-task', 'legacy-project', 'legacy-column', 'Task', 0);
        INSERT INTO habits (id, name, position) VALUES ('legacy-habit', 'Habit', 0);
        INSERT INTO checklists (id, name, position) VALUES ('legacy-checklist', 'Checklist', 0);
        INSERT INTO checklist_items (id, list_id, text, position) VALUES ('legacy-checklist-item', 'legacy-checklist', 'Item', 0);
      `);
      existingTableNames = client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map((row) => (row as { name: string }).name);
    } finally {
      client.close();
    }

    expect(userVersionOf(path)).toBe(9);
    createDb(path).$client.close();

    expect(userVersionOf(path)).toBe(22);
    withClient(path, (database) => {
      const tableNames = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(tableNames.filter((name) => !existingTableNames.includes(name)).sort()).toEqual([
        "categories",
        "goal_groups",
        "goal_tags",
        "goals",
        "page_sections",
        "preferences",
        "routine_blocks",
        "routine_day_windows",
        "routine_days",
        "routine_mirrors",
        "routine_occurrences",
        "routine_settings",
        "tags",
      ]);
      expect(database.prepare("SELECT id, title, position FROM pages WHERE id = 'legacy-page'").get()).toEqual({
        id: "legacy-page",
        title: "Page",
        position: 0,
      });
      expect(database.prepare("SELECT id, name FROM projects WHERE id = 'legacy-project'").get()).toEqual({
        id: "legacy-project",
        name: "Project",
      });
      expect(database.prepare("SELECT id, title FROM tasks WHERE id = 'legacy-task'").get()).toEqual({
        id: "legacy-task",
        title: "Task",
      });
      expect(database.prepare("SELECT id, name FROM habits WHERE id = 'legacy-habit'").get()).toEqual({
        id: "legacy-habit",
        name: "Habit",
      });
      expect(database.prepare("SELECT id, name FROM checklists WHERE id = 'legacy-checklist'").get()).toEqual({
        id: "legacy-checklist",
        name: "Checklist",
      });
      expect(database.prepare("SELECT id, text FROM checklist_items WHERE id = 'legacy-checklist-item'").get()).toEqual({
        id: "legacy-checklist-item",
        text: "Item",
      });
      expect(database.pragma("foreign_key_check")).toEqual([]);
    });
  });

  it("upgrades a page with an icon through 0002 without losing data or foreign-key integrity", () => {
    const path = newDatabasePath();
    const client = new Database(path);
    try {
      for (const filename of ["0000_tiny_morph.sql", "0001_page_icons.sql"]) {
        const sql = readFileSync(join(drizzleFolder, filename), "utf8");
        const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
        for (const statement of statements) client.exec(statement);
      }
      client.pragma("foreign_keys = ON");
      client.pragma("user_version = 2");
      client.prepare("INSERT INTO pages (id, title, icon, position) VALUES (?, ?, ?, ?)").run(
        "legacy-icon",
        "Survivor",
        "notebook-text",
        0
      );
    } finally {
      client.close();
    }

    const upgraded = createDb(path);
    upgraded.$client.close();

    expect(userVersionOf(path)).toBe(22);
    withClient(path, (database) => {
      expect(database.prepare("SELECT id, title, icon FROM pages WHERE id = ?").get("legacy-icon")).toEqual({
        id: "legacy-icon",
        title: "Survivor",
        icon: "notebook-text",
      });
      expect(database.pragma("foreign_key_check")).toEqual([]);
    });
  });
});
