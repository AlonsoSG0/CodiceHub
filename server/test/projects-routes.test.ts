import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import { app } from "../src/app.js";

type Project = { id: string; name: string; description: string | null; createdAt: string; updatedAt: string };
type Column = {
  id: string;
  projectId: string;
  name: string;
  isCompleted: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};
type Task = {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  goalId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};
type CalendarTask = {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  columnId: string;
  columnName: string;
  isCompleted: boolean;
};

const missingId = "00000000-0000-4000-8000-000000000000";

async function expectJson(response: Response, status: number, body: unknown): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await response.text()).toBe(JSON.stringify(body));
}

function expectKeys(value: object, keys: string[]): void {
  expect(Object.keys(value)).toEqual(keys);
}

async function expectProject(response: Response, status: number, expected: Partial<Project> = {}): Promise<Project> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const project = (await response.json()) as Project;
  expectKeys(project, ["id", "name", "description", "archivedAt", "createdAt", "updatedAt"]);
  expect(project.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(project).toMatchObject(expected);
  return project;
}

async function expectColumn(response: Response, status: number, expected: Partial<Column> = {}): Promise<Column> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const column = (await response.json()) as Column;
  expectKeys(column, ["id", "projectId", "name", "isCompleted", "position", "createdAt", "updatedAt"]);
  expect(column.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(column).toMatchObject(expected);
  return column;
}

async function expectTask(response: Response, status: number, expected: Partial<Task> = {}): Promise<Task> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const task = (await response.json()) as Task;
  expectKeys(task, ["id", "projectId", "columnId", "title", "description", "dueDate", "priority", "goalId", "position", "createdAt", "updatedAt"]);
  expect(task.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(task).toMatchObject(expected);
  return task;
}

describe("projects HTTP API", () => {
  let db: ChubDatabase;
  let directory: string;
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

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "chub-projects-api-"));
    db = createDb(join(directory, "chub.db"));
    api = { request: (input, init) => app.request(input, init, { db }) };
  });

  afterEach(() => {
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates a project with its three ordered columns", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Launch", description: "A project" }), 201, {
      name: "Launch",
      description: "A project",
    });
    expect(project.createdAt).toBeTruthy();
    expect(project.updatedAt).toBeTruthy();

    const board = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as {
      project: Project;
      columns: Column[];
      tasks: Task[];
    };
    expectKeys(board, ["project", "columns", "tasks"]);
    expect(board.project).toEqual(project);
    expect(board.tasks).toEqual([]);
    expect(board.columns.map(({ name, isCompleted, position }) => ({ name, isCompleted, position }))).toEqual([
      { name: "Backlog", isCompleted: false, position: 0 },
      { name: "In progress", isCompleted: false, position: 1 },
      { name: "Done", isCompleted: true, position: 2 },
    ]);
    for (const column of board.columns) {
      expectKeys(column, ["id", "projectId", "name", "isCompleted", "position", "createdAt", "updatedAt"]);
      expect(column.projectId).toBe(project.id);
    }
  });

  it("creates a task in the first column when no column is supplied", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Launch" }), 201);
    const board = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as { columns: Column[] };

    const task = await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "Write brief" }), 201, {
      projectId: project.id,
      columnId: board.columns[0].id,
      title: "Write brief",
      description: null,
      dueDate: null,
      position: 0,
    });
    expect(task.createdAt).toBeTruthy();
    expect(task.updatedAt).toBeTruthy();
  });

  it("applies a board layout and keeps task positions contiguous", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Launch" }), 201);
    const initial = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as { columns: Column[] };
    const [backlog, inProgress, done] = initial.columns;
    const first = await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "First" }), 201);
    const second = await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "Second" }), 201);
    const third = await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "Third", columnId: inProgress.id }), 201);

    const response = await put(`/api/projects/${project.id}/layout`, {
      columns: [done.id, inProgress.id, backlog.id],
      tasks: [
        { id: second.id, columnId: backlog.id },
        { id: first.id, columnId: inProgress.id },
        { id: third.id, columnId: inProgress.id },
      ],
    });
    expect(response.status).toBe(200);
    const layout = (await response.json()) as { columns: Column[]; tasks: Task[] };
    expectKeys(layout, ["columns", "tasks"]);
    expect(layout.columns.map(({ id, position }) => [id, position])).toEqual([
      [done.id, 0],
      [inProgress.id, 1],
      [backlog.id, 2],
    ]);
    expect(layout.tasks.map(({ id, columnId, position }) => [id, columnId, position])).toEqual([
      [first.id, inProgress.id, 0],
      [third.id, inProgress.id, 1],
      [second.id, backlog.id, 0],
    ]);
  });

  it("reindexes unlisted tasks around the requested positions", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Launch" }), 201);
    const initial = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as { columns: Column[] };
    const [backlog, inProgress, done] = initial.columns;
    const existingFirst = await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "Existing first" }), 201);
    const existingSecond = await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "Existing second" }), 201);
    const movedFirst = await expectTask(
      await post(`/api/projects/${project.id}/tasks`, { title: "Moved first", columnId: inProgress.id }),
      201,
    );
    const movedSecond = await expectTask(
      await post(`/api/projects/${project.id}/tasks`, { title: "Moved second", columnId: done.id }),
      201,
    );

    const response = await put(`/api/projects/${project.id}/layout`, {
      columns: [backlog.id, inProgress.id, done.id],
      tasks: [
        { id: movedFirst.id, columnId: backlog.id },
        { id: movedSecond.id, columnId: backlog.id },
      ],
    });
    expect(response.status).toBe(200);
    const layout = (await response.json()) as { columns: Column[]; tasks: Task[] };
    expect(layout.tasks.map(({ id, columnId, position }) => [id, columnId, position])).toEqual([
      [movedFirst.id, backlog.id, 0],
      [existingFirst.id, backlog.id, 1],
      [movedSecond.id, backlog.id, 2],
      [existingSecond.id, backlog.id, 3],
    ]);
  });

  it("moves tasks from a deleted column and refuses to delete the last column", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Launch" }), 201);
    const initial = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as { columns: Column[] };
    const [backlog, inProgress, done] = initial.columns;
    const first = await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "Existing", columnId: inProgress.id }), 201);
    const moved = await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "Moved", columnId: backlog.id }), 201);

    await expectJson(await api.request(`/api/columns/${backlog.id}`, { method: "DELETE" }), 200, { deleted: backlog.id });
    const board = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as {
      columns: Column[];
      tasks: Task[];
    };
    expect(board.columns.map(({ id, position }) => [id, position])).toEqual([[inProgress.id, 0], [done.id, 1]]);
    expect(board.tasks.map(({ id, columnId, position }) => [id, columnId, position])).toEqual([
      [first.id, inProgress.id, 0],
      [moved.id, inProgress.id, 1],
    ]);

    await expectJson(await api.request(`/api/columns/${done.id}`, { method: "DELETE" }), 200, { deleted: done.id });
    await expectJson(await api.request(`/api/columns/${inProgress.id}`, { method: "DELETE" }), 400, { error: "last_column" });
    const afterRejectedDelete = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as {
      columns: Column[];
      tasks: Task[];
    };
    expect(afterRejectedDelete.columns.map(({ id }) => id)).toEqual([inProgress.id]);
    expect(afterRejectedDelete.tasks.map(({ id, columnId, position }) => [id, columnId, position])).toEqual([
      [first.id, inProgress.id, 0],
      [moved.id, inProgress.id, 1],
    ]);
  });

  it("lists project and column task counts, including completed-column tasks", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Launch", description: null }), 201);
    const board = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as { columns: Column[] };
    const [backlog, , done] = board.columns;
    await post(`/api/projects/${project.id}/tasks`, { title: "One", columnId: backlog.id });
    await post(`/api/projects/${project.id}/tasks`, { title: "Two", columnId: backlog.id });
    await post(`/api/projects/${project.id}/tasks`, { title: "Three", columnId: done.id });

    const list = (await (await api.request("/api/projects")).json()) as {
      projects: Array<Project & { taskCount: number; doneTaskCount: number; columns: Array<{ id: string; name: string; isCompleted: boolean; taskCount: number }> }>;
    };
    expect(list.projects).toHaveLength(1);
    const summary = list.projects[0];
    expectKeys(summary, ["id", "name", "description", "archivedAt", "createdAt", "updatedAt", "taskCount", "doneTaskCount", "columns"]);
    expect(summary).toMatchObject({ id: project.id, taskCount: 3, doneTaskCount: 1 });
    expect(summary.columns).toEqual([
      { id: backlog.id, name: "Backlog", isCompleted: false, taskCount: 2 },
      { id: board.columns[1].id, name: "In progress", isCompleted: false, taskCount: 0 },
      { id: done.id, name: "Done", isCompleted: true, taskCount: 1 },
    ]);
  });

  it("lists tasks in the inclusive calendar range and excludes undated tasks", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Launch" }), 201);
    const board = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as { columns: Column[] };
    const [backlog, , done] = board.columns;
    await post(`/api/projects/${project.id}/tasks`, { title: "Before", columnId: backlog.id, dueDate: "2026-04-30" });
    const from = await expectTask(
      await post(`/api/projects/${project.id}/tasks`, { title: "From", columnId: backlog.id, dueDate: "2026-05-01" }),
      201,
    );
    const inside = await expectTask(
      await post(`/api/projects/${project.id}/tasks`, { title: "Inside", columnId: done.id, dueDate: "2026-05-15" }),
      201,
    );
    const to = await expectTask(
      await post(`/api/projects/${project.id}/tasks`, { title: "To", columnId: done.id, dueDate: "2026-05-31" }),
      201,
    );
    await post(`/api/projects/${project.id}/tasks`, { title: "After", columnId: backlog.id, dueDate: "2026-06-01" });
    await post(`/api/projects/${project.id}/tasks`, { title: "No date", columnId: backlog.id });

    const response = await api.request("/api/tasks?from=2026-05-01&to=2026-05-31");
    expect(response.status).toBe(200);
    const result = (await response.json()) as { tasks: CalendarTask[] };
    expectKeys(result, ["tasks"]);
    expect(result.tasks.map(({ id, title, dueDate, projectId, projectName, columnId, columnName, isCompleted }) => ({
      id,
      title,
      dueDate,
      projectId,
      projectName,
      columnId,
      columnName,
      isCompleted,
    }))).toEqual([
      {
        id: from.id,
        title: "From",
        dueDate: "2026-05-01",
        projectId: project.id,
        projectName: "Launch",
        columnId: backlog.id,
        columnName: "Backlog",
        isCompleted: false,
      },
      {
        id: inside.id,
        title: "Inside",
        dueDate: "2026-05-15",
        projectId: project.id,
        projectName: "Launch",
        columnId: done.id,
        columnName: "Done",
        isCompleted: true,
      },
      {
        id: to.id,
        title: "To",
        dueDate: "2026-05-31",
        projectId: project.id,
        projectName: "Launch",
        columnId: done.id,
        columnName: "Done",
        isCompleted: true,
      },
    ]);
    for (const task of result.tasks) expectKeys(task, ["id", "title", "dueDate", "projectId", "projectName", "columnId", "columnName", "isCompleted"]);
  });

  it("updates projects, columns, and tasks and deletes project data", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Launch" }), 201);
    const board = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as { columns: Column[] };
    const backlog = board.columns[0];
    const task = await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "Draft" }), 201);

    await expectProject(await patch(`/api/projects/${project.id}`, { name: "Release", description: "Ready" }), 200, {
      name: "Release",
      description: "Ready",
    });
    await expectColumn(await patch(`/api/columns/${backlog.id}`, { name: "Ideas", isCompleted: true }), 200, {
      name: "Ideas",
      isCompleted: true,
    });
    await expectTask(await patch(`/api/tasks/${task.id}`, { title: "Final draft", description: "Review", dueDate: "2026-05-20" }), 200, {
      title: "Final draft",
      description: "Review",
      dueDate: "2026-05-20",
    });

    await expectJson(await api.request(`/api/projects/${project.id}`, { method: "DELETE" }), 200, { deleted: project.id });
    await expectJson(await api.request(`/api/projects/${project.id}/board`), 404, { error: "project_not_found" });
    const projects = (await (await api.request("/api/projects")).json()) as { projects: unknown[] };
    expect(projects.projects).toEqual([]);
  });

  it("rejects malformed calendar ranges and reports missing entities", async () => {
    await expectJson(await api.request("/api/tasks?from=2026-05-01"), 400, { error: "invalid_range" });
    await expectJson(await api.request("/api/tasks?from=bad&to=2026-05-01"), 400, { error: "invalid_range" });
    await expectJson(await api.request(`/api/projects/${missingId}/board`), 404, { error: "project_not_found" });
    await expectJson(await patch(`/api/tasks/${missingId}`, { title: "Missing" }), 404, { error: "task_not_found" });
  });

  it("carries a priority and a goal, and moves between columns without losing them", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Meta board" }), 201);
    const board = (await (await api.request(`/api/projects/${project.id}/board`)).json()) as {
      columns: Array<{ id: string; name: string }>;
    };
    const backlog = board.columns.find(({ name }) => name === "Backlog")!;
    const done = board.columns.find(({ name }) => name === "Done")!;

    const goalGroup = (await (await post("/api/goals/groups", { name: "Linked" })).json()) as { id: string };
    const goal = (await (await post(`/api/goals/groups/${goalGroup.id}/goals`, { title: "Serve me" })).json()) as {
      id: string;
    };

    const created = await expectTask(
      await post(`/api/projects/${project.id}/tasks`, { title: "Do it", priority: "now", goalId: goal.id }),
      201,
      { priority: "now", goalId: goal.id, columnId: backlog.id },
    );
    await expectTask(await post(`/api/projects/${project.id}/tasks`, { title: "Plain" }), 201, {
      priority: "none",
      goalId: null,
    });

    await expectTask(await patch(`/api/tasks/${created.id}`, { priority: "high", goalId: null }), 200, {
      priority: "high",
      goalId: null,
    });
    await expectTask(await patch(`/api/tasks/${created.id}`, { goalId: goal.id }), 200, { goalId: goal.id });

    const listed = (await (await api.request(`/api/tasks?goalId=${goal.id}`)).json()) as {
      tasks: Array<{ id: string; projectName: string }>;
    };
    expect(listed.tasks.map(({ id }) => id)).toEqual([created.id]);
    expect(listed.tasks[0]!.projectName).toBe("Meta board");

    const moved = await expectTask(await patch(`/api/tasks/${created.id}`, { columnId: done.id }), 200, {
      columnId: done.id,
      goalId: goal.id,
      priority: "high",
    });
    expect(moved.position).toBe(0);

    await expectJson(await patch(`/api/tasks/${created.id}`, { priority: "urgent" }), 400, {
      error: "invalid_priority",
    });
    await expectJson(
      await patch(`/api/tasks/${created.id}`, { goalId: "00000000-0000-4000-8000-000000000000" }),
      400,
      { error: "invalid_goal" },
    );
  });

  it("archives a project instead of deleting it, and restores it", async () => {
    const project = await expectProject(await post("/api/projects", { name: "Paused work" }), 201);

    await expectProject(await patch(`/api/projects/${project.id}`, { archived: true }), 200, {
      archivedAt: expect.any(String),
    });
    const active = (await (await api.request("/api/projects")).json()) as { projects: Array<{ id: string }> };
    expect(active.projects.map(({ id }) => id)).not.toContain(project.id);
    const archived = (await (await api.request("/api/projects?archived=1")).json()) as { projects: Array<{ id: string }> };
    expect(archived.projects.map(({ id }) => id)).toContain(project.id);

    await expectProject(await patch(`/api/projects/${project.id}`, { archived: false }), 200, { archivedAt: null });
    const restored = (await (await api.request("/api/projects")).json()) as { projects: Array<{ id: string }> };
    expect(restored.projects.map(({ id }) => id)).toContain(project.id);

    await expectJson(await patch(`/api/projects/${project.id}`, { archived: "yes" }), 400, { error: "invalid_body" });
  });
});
