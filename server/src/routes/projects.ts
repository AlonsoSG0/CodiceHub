import { Hono, type Context } from "hono";
import type { ChubDatabase } from "../db/client.js";
import {
  createProjectsRepository,
  ProjectError,
  type CreateColumnInput,
  type CreateProjectInput,
  type CreateTaskInput,
  type ProjectLayoutInput,
  type UpdateColumnInput,
  type UpdateProjectInput,
  type UpdateTaskInput,
} from "../projects/repository.js";

type AppEnv = { Bindings: { db: ChubDatabase } };
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: JsonObject, key: string): boolean {
  return Object.hasOwn(value, key);
}

function jsonError(c: Context<AppEnv>, error: string, status: 400 | 404): Response {
  return c.json({ error }, status);
}

function repositoryError(c: Context<AppEnv>, error: unknown): Response {
  if (!(error instanceof ProjectError)) throw error;
  if (error.code === "project_not_found" || error.code === "column_not_found" || error.code === "task_not_found") {
    return jsonError(c, error.code, 404);
  }
  return jsonError(c, error.code, 400);
}

async function parseJson(c: Context<AppEnv>): Promise<{ body: unknown } | { response: Response }> {
  try {
    return { body: await c.req.json() };
  } catch {
    return { response: jsonError(c, "invalid_json", 400) };
  }
}

function isCalendarDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const priorities = new Set(["none", "low", "medium", "high", "now"]);

export function createProjectsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/projects", (c) => {
    try {
      const archived = c.req.query("archived") === "1";
      return c.json({ projects: createProjectsRepository(c.env.db).list(archived) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/projects", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const body = parsed.body;
    if (!hasOwn(body, "name") || typeof body.name !== "string") return jsonError(c, "invalid_name", 400);
    if (hasOwn(body, "description") && body.description !== null && typeof body.description !== "string") {
      return jsonError(c, "invalid_description", 400);
    }

    const input: CreateProjectInput = { name: body.name };
    if (hasOwn(body, "description")) input.description = body.description as string | null;
    try {
      return c.json(createProjectsRepository(c.env.db).create(input), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/projects/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const body = parsed.body;
    if (hasOwn(body, "name") && typeof body.name !== "string") return jsonError(c, "invalid_name", 400);
    if (hasOwn(body, "description") && body.description !== null && typeof body.description !== "string") {
      return jsonError(c, "invalid_description", 400);
    }
    if (hasOwn(body, "archived") && typeof body.archived !== "boolean") {
      return jsonError(c, "invalid_body", 400);
    }

    const input: UpdateProjectInput = {};
    if (hasOwn(body, "name")) input.name = body.name as string;
    if (hasOwn(body, "description")) input.description = body.description as string | null;
    if (hasOwn(body, "archived")) input.archived = body.archived as boolean;
    try {
      return c.json(createProjectsRepository(c.env.db).update(c.req.param("id"), input), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/projects/:id", (c) => {
    try {
      createProjectsRepository(c.env.db).remove(c.req.param("id"));
      return c.json({ deleted: c.req.param("id") }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/projects/:id/board", (c) => {
    try {
      const { project, columns, tasks } = createProjectsRepository(c.env.db).getBoard(c.req.param("id"));
      return c.json({ project, columns, tasks }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.put("/projects/:id/layout", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body) || !Array.isArray(parsed.body.columns) || !Array.isArray(parsed.body.tasks)) {
      return jsonError(c, "invalid_body", 400);
    }
    if (!parsed.body.columns.every((columnId) => typeof columnId === "string")) return jsonError(c, "invalid_body", 400);
    if (
      !parsed.body.tasks.every(
        (task) => isObject(task) && typeof task.id === "string" && typeof task.columnId === "string"
      )
    ) {
      return jsonError(c, "invalid_body", 400);
    }
    const columns = parsed.body.columns as string[];
    const placements = parsed.body.tasks as Array<{ id: string; columnId: string }>;
    if (new Set(columns).size !== columns.length || new Set(placements.map(({ id }) => id)).size !== placements.length) {
      return jsonError(c, "invalid_body", 400);
    }
    const input: ProjectLayoutInput = { columns, tasks: placements };
    try {
      return c.json(createProjectsRepository(c.env.db).applyLayout(c.req.param("id"), input), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/projects/:id/columns", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const body = parsed.body;
    if (!hasOwn(body, "name") || typeof body.name !== "string") return jsonError(c, "invalid_name", 400);
    if (hasOwn(body, "isCompleted") && typeof body.isCompleted !== "boolean") return jsonError(c, "invalid_is_completed", 400);

    const input: CreateColumnInput = { name: body.name };
    if (hasOwn(body, "isCompleted")) input.isCompleted = body.isCompleted as boolean;
    try {
      return c.json(createProjectsRepository(c.env.db).createColumn(c.req.param("id"), input), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/columns/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const body = parsed.body;
    if (hasOwn(body, "name") && typeof body.name !== "string") return jsonError(c, "invalid_name", 400);
    if (hasOwn(body, "isCompleted") && typeof body.isCompleted !== "boolean") return jsonError(c, "invalid_is_completed", 400);

    const input: UpdateColumnInput = {};
    if (hasOwn(body, "name")) input.name = body.name as string;
    if (hasOwn(body, "isCompleted")) input.isCompleted = body.isCompleted as boolean;
    try {
      return c.json(createProjectsRepository(c.env.db).updateColumn(c.req.param("id"), input), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/columns/:id", (c) => {
    try {
      createProjectsRepository(c.env.db).removeColumn(c.req.param("id"));
      return c.json({ deleted: c.req.param("id") }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/projects/:id/tasks", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const body = parsed.body;
    if (!hasOwn(body, "title") || typeof body.title !== "string") return jsonError(c, "invalid_title", 400);
    if (hasOwn(body, "description") && body.description !== null && typeof body.description !== "string") {
      return jsonError(c, "invalid_description", 400);
    }
    if (
      hasOwn(body, "dueDate") &&
      body.dueDate !== null &&
      (typeof body.dueDate !== "string" || !isCalendarDay(body.dueDate))
    ) {
      return jsonError(c, "invalid_due_date", 400);
    }
    if (hasOwn(body, "columnId") && typeof body.columnId !== "string") return jsonError(c, "invalid_column_id", 400);
    if (hasOwn(body, "priority") && (typeof body.priority !== "string" || !priorities.has(body.priority))) {
      return jsonError(c, "invalid_priority", 400);
    }
    if (hasOwn(body, "goalId") && body.goalId !== null && typeof body.goalId !== "string") {
      return jsonError(c, "invalid_goal", 400);
    }

    const input: CreateTaskInput = { title: body.title };
    if (hasOwn(body, "description")) input.description = body.description as string | null;
    if (hasOwn(body, "dueDate")) input.dueDate = body.dueDate as string | null;
    if (hasOwn(body, "columnId")) input.columnId = body.columnId as string;
    if (hasOwn(body, "priority")) input.priority = body.priority as CreateTaskInput["priority"];
    if (hasOwn(body, "goalId")) input.goalId = body.goalId as string | null;
    try {
      return c.json(createProjectsRepository(c.env.db).createTask(c.req.param("id"), input), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/tasks/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const body = parsed.body;
    if (hasOwn(body, "title") && typeof body.title !== "string") return jsonError(c, "invalid_title", 400);
    if (hasOwn(body, "description") && body.description !== null && typeof body.description !== "string") {
      return jsonError(c, "invalid_description", 400);
    }
    if (
      hasOwn(body, "dueDate") &&
      body.dueDate !== null &&
      (typeof body.dueDate !== "string" || !isCalendarDay(body.dueDate))
    ) {
      return jsonError(c, "invalid_due_date", 400);
    }

    if (hasOwn(body, "columnId") && typeof body.columnId !== "string") return jsonError(c, "invalid_column_id", 400);
    if (hasOwn(body, "priority") && (typeof body.priority !== "string" || !priorities.has(body.priority))) {
      return jsonError(c, "invalid_priority", 400);
    }
    if (hasOwn(body, "goalId") && body.goalId !== null && typeof body.goalId !== "string") {
      return jsonError(c, "invalid_goal", 400);
    }

    const input: UpdateTaskInput = {};
    if (hasOwn(body, "title")) input.title = body.title as string;
    if (hasOwn(body, "description")) input.description = body.description as string | null;
    if (hasOwn(body, "dueDate")) input.dueDate = body.dueDate as string | null;
    if (hasOwn(body, "columnId")) input.columnId = body.columnId as string;
    if (hasOwn(body, "priority")) input.priority = body.priority as UpdateTaskInput["priority"];
    if (hasOwn(body, "goalId")) input.goalId = body.goalId as string | null;
    try {
      return c.json(createProjectsRepository(c.env.db).updateTask(c.req.param("id"), input), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/tasks/:id", (c) => {
    try {
      createProjectsRepository(c.env.db).removeTask(c.req.param("id"));
      return c.json({ deleted: c.req.param("id") }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/tasks", (c) => {
    const goalId = c.req.query("goalId");
    if (goalId !== undefined) {
      try {
        return c.json({ tasks: createProjectsRepository(c.env.db).byGoal(goalId) }, 200);
      } catch (error) {
        return repositoryError(c, error);
      }
    }

    const from = c.req.query("from");
    const to = c.req.query("to");
    if (from === undefined || to === undefined || !isCalendarDay(from) || !isCalendarDay(to) || from > to) {
      return jsonError(c, "invalid_range", 400);
    }
    try {
      return c.json({ tasks: createProjectsRepository(c.env.db).calendar(from, to) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  return routes;
}
