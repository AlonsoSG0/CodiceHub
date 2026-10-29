import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import { app } from "../src/app.js";

/**
 * The data invariants of the projects section, checked directly against the database.
 *
 * The HTTP tests in `projects-routes.test.ts` cover the shape of the answers. These cover the things a
 * shape cannot show: that the tables are the ones the journal says, that a board stays contiguous after
 * a card moves, that deleting a column keeps its tasks, and that a rejected request leaves the database
 * byte for byte as it was.
 */

type Task = {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  dueDate: string | null;
  position: number;
};

type Column = {
  id: string;
  projectId: string;
  name: string;
  isCompleted: boolean;
  position: number;
};

describe("projects data integrity", () => {
  let directory: string;
  let dbPath: string;
  let db: ChubDatabase;

  const request = (path: string, init?: RequestInit) => app.request(path, init, { db });
  const send = (method: string, path: string, body: unknown) =>
    request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  /** The digest of the whole database, so a rejected request can be shown to have changed nothing. */
  const hashDb = (): string => {
    db.$client.pragma("wal_checkpoint(TRUNCATE)");
    db.$client.close();
    const digest = createHash("sha256").update(readFileSync(dbPath)).digest("hex");
    db = createDb(dbPath);
    return digest;
  };

  const createProject = async (name: string): Promise<{ id: string; columns: Column[] }> => {
    const response = await send("POST", "/api/projects", { name });
    expect(response.status).toBe(201);
    const project = (await response.json()) as { id: string };
    const board = (await (await request(`/api/projects/${project.id}/board`)).json()) as { columns: Column[] };
    return { id: project.id, columns: board.columns };
  };

  const addTask = async (
    projectId: string,
    title: string,
    columnId: string,
    dueDate: string | null = null,
  ): Promise<Task> => {
    const response = await send("POST", `/api/projects/${projectId}/tasks`, { title, columnId, dueDate });
    expect(response.status).toBe(201);
    return (await response.json()) as Task;
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "chub-projects-integrity-"));
    dbPath = join(directory, "chub.db");
    db = createDb(dbPath);
  });

  afterEach(() => {
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates the three tables with their cascades and their indexes", () => {
    expect(db.$client.pragma("user_version", { simple: true })).toBe(22);
    expect(db.$client.pragma("foreign_key_check")).toEqual([]);

    const columnsOf = (table: string): string[] =>
      (db.$client.pragma(`table_info(${table})`) as Array<{ name: string }>).map((row) => row.name);

    expect(columnsOf("projects")).toEqual(["id", "name", "description", "created_at", "updated_at", "archived_at"]);
    expect(columnsOf("project_columns")).toEqual([
      "id",
      "project_id",
      "name",
      "is_completed",
      "position",
      "created_at",
      "updated_at",
    ]);
    // ALTER TABLE appends, so the migrated columns sit after `updated_at`.
    expect(columnsOf("tasks")).toEqual([
      "id",
      "project_id",
      "column_id",
      "title",
      "description",
      "due_date",
      "position",
      "created_at",
      "updated_at",
      "priority",
      "goal_id",
    ]);

    const indexesOf = (table: string): string[] =>
      (db.$client.pragma(`index_list(${table})`) as Array<{ name: string }>).map((row) => row.name);

    expect(indexesOf("project_columns")).toContain("project_columns_project_id_position_idx");
    expect(indexesOf("tasks")).toEqual(
      expect.arrayContaining(["tasks_column_id_position_idx", "tasks_project_id_idx", "tasks_due_date_idx"]),
    );

    const cascades = db.$client.pragma("foreign_key_list(tasks)") as Array<{ from: string; on_delete: string }>;
    const onDelete = new Map(cascades.map((row) => [row.from, row.on_delete]));
    // The board owns its tasks; a goal is only a label, so losing the goal must not lose the work.
    expect(onDelete.get("project_id")).toBe("CASCADE");
    expect(onDelete.get("column_id")).toBe("CASCADE");
    expect(onDelete.get("goal_id")).toBe("SET NULL");
  });

  it("seeds a project with its own three columns and keeps the projects apart", async () => {
    const primary = await createProject("Primary");
    const other = await createProject("Other");

    expect(primary.columns.map((column) => [column.name, column.isCompleted, column.position])).toEqual([
      ["Backlog", false, 0],
      ["In progress", false, 1],
      ["Done", true, 2],
    ]);
    expect(other.columns.every((column) => !primary.columns.some((mine) => mine.id === column.id))).toBe(true);
  });

  it("moves a card across columns and re-indexes both columns from zero", async () => {
    const project = await createProject("Primary");
    const [backlog, progress, done] = project.columns;

    const from = await addTask(project.id, "From", backlog.id);
    const middle = await addTask(project.id, "Middle", backlog.id);
    const before = await addTask(project.id, "Before", backlog.id);
    const to = await addTask(project.id, "To", progress.id);
    const undated = await addTask(project.id, "Undated", done.id);

    const response = await send("PUT", `/api/projects/${project.id}/layout`, {
      columns: [done.id, progress.id, backlog.id],
      tasks: [
        { id: from.id, columnId: progress.id },
        { id: to.id, columnId: backlog.id },
      ],
    });
    expect(response.status).toBe(200);

    const layout = (await response.json()) as { columns: Column[]; tasks: Task[] };
    expect(layout.columns.map((column) => [column.id, column.position])).toEqual([
      [done.id, 0],
      [progress.id, 1],
      [backlog.id, 2],
    ]);
    expect(layout.tasks.map((task) => [task.id, task.columnId, task.position])).toEqual([
      [undated.id, done.id, 0],
      [from.id, progress.id, 0],
      [to.id, backlog.id, 0],
      [middle.id, backlog.id, 1],
      [before.id, backlog.id, 2],
    ]);
  });

  it("keeps the tasks of a deleted column and refuses to delete the last one", async () => {
    const project = await createProject("Primary");
    const [backlog, progress, done] = project.columns;
    const kept = await addTask(project.id, "Kept", backlog.id);

    const removed = await request(`/api/columns/${backlog.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);

    const afterDelete = (await (await request(`/api/projects/${project.id}/board`)).json()) as {
      columns: Column[];
      tasks: Task[];
    };
    expect(afterDelete.columns.map((column) => column.position)).toEqual([0, 1]);
    expect(afterDelete.tasks.map((task) => [task.id, task.columnId, task.position])).toEqual([
      [kept.id, progress.id, 0],
    ]);

    await request(`/api/columns/${progress.id}`, { method: "DELETE" });

    const beforeRefusal = hashDb();
    const refused = await request(`/api/columns/${done.id}`, { method: "DELETE" });
    expect(refused.status).toBe(400);
    expect(await refused.text()).toBe('{"error":"last_column"}');
    expect(hashDb()).toBe(beforeRefusal);
  });

  it("leaves the database untouched when a request is refused", async () => {
    const project = await createProject("Primary");
    const other = await createProject("Other");
    const [backlog] = project.columns;
    const foreign = await addTask(other.id, "Foreign", other.columns[0].id);

    const invalidDateBefore = hashDb();
    const invalidDate = await send("POST", `/api/projects/${project.id}/tasks`, {
      title: "Invalid date",
      columnId: backlog.id,
      dueDate: "not-a-date",
    });
    expect(invalidDate.status).toBe(400);
    expect(await invalidDate.text()).toBe('{"error":"invalid_due_date"}');
    expect(hashDb()).toBe(invalidDateBefore);

    const unknownTaskBefore = hashDb();
    const unknownTask = await send("PUT", `/api/projects/${project.id}/layout`, {
      columns: project.columns.map((column) => column.id),
      tasks: [{ id: foreign.id, columnId: backlog.id }],
    });
    expect(unknownTask.status).toBe(400);
    expect(await unknownTask.text()).toBe('{"error":"unknown_task"}');
    expect(hashDb()).toBe(unknownTaskBefore);

    const local = await addTask(project.id, "Local", backlog.id);
    const unknownColumnBefore = hashDb();
    const unknownColumn = await send("PUT", `/api/projects/${project.id}/layout`, {
      columns: project.columns.map((column) => column.id),
      tasks: [{ id: local.id, columnId: other.columns[0].id }],
    });
    expect(unknownColumn.status).toBe(400);
    expect(await unknownColumn.text()).toBe('{"error":"unknown_column"}');
    expect(hashDb()).toBe(unknownColumnBefore);
  });

  it("counts the tasks of a project and answers the calendar inclusively", async () => {
    const project = await createProject("Primary");
    const [backlog, progress] = project.columns;

    const from = await addTask(project.id, "From", backlog.id, "2026-05-01");
    const middle = await addTask(project.id, "Middle", backlog.id, "2026-05-16");
    const to = await addTask(project.id, "To", progress.id, "2026-05-31");
    const outside = await addTask(project.id, "Outside", backlog.id, "2026-04-30");
    const undated = await addTask(project.id, "Undated", backlog.id, null);

    const list = (await (await request("/api/projects")).json()) as {
      projects: Array<{ id: string; taskCount: number; doneTaskCount: number }>;
    };
    expect(list.projects.find((entry) => entry.id === project.id)).toMatchObject({
      taskCount: 5,
      doneTaskCount: 0,
    });

    const calendar = (await (await request("/api/tasks?from=2026-05-01&to=2026-05-31")).json()) as {
      tasks: Array<{ id: string }>;
    };
    expect(calendar.tasks.map((task) => task.id)).toEqual([from.id, middle.id, to.id]);
    expect(calendar.tasks.map((task) => task.id)).not.toContain(outside.id);
    expect(calendar.tasks.map((task) => task.id)).not.toContain(undated.id);

    const malformed = await request("/api/tasks?from=nope&to=2026-05-31");
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).toBe('{"error":"invalid_range"}');
  });

  it("takes a project, its columns and its tasks down together", async () => {
    const project = await createProject("Primary");
    await addTask(project.id, "Task", project.columns[0].id);

    const removed = await request(`/api/projects/${project.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);

    expect(db.$client.prepare("SELECT COUNT(*) AS n FROM projects WHERE id = ?").get(project.id)).toEqual({ n: 0 });
    expect(
      db.$client.prepare("SELECT COUNT(*) AS n FROM project_columns WHERE project_id = ?").get(project.id),
    ).toEqual({ n: 0 });
    expect(db.$client.prepare("SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?").get(project.id)).toEqual({ n: 0 });
    expect(db.$client.pragma("foreign_key_check")).toEqual([]);
  });
});
