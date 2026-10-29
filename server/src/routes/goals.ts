import { Hono, type Context } from "hono";
import type { ChubDatabase } from "../db/client.js";
import {
  createGoalsRepository,
  GoalError,
  type UpdateGoalInput,
} from "../goals/repository.js";

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
  if (!(error instanceof GoalError)) throw error;
  if (error.code === "group_not_found" || error.code === "goal_not_found") {
    return jsonError(c, error.code, 404);
  }
  return jsonError(c, error.code, 400);
}

async function parseJson(c: Context<AppEnv>): Promise<{ body: unknown } | { response: Response }> {
  try {
    return { body: await c.req.json() };
  } catch {
    return { response: jsonError(c, "invalid_body", 400) };
  }
}

function isJsonSerializable(value: unknown): boolean {
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}

export function createGoalsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/goals", (c) => {
    try {
      const archived = c.req.query("archived") === "1";
      return c.json({ groups: createGoalsRepository(c.env.db).listGoalGroups(archived) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/goals/groups", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (!hasOwn(parsed.body, "name") || typeof parsed.body.name !== "string") {
      return jsonError(c, "invalid_name", 400);
    }
    for (const key of ["periodStart", "periodEnd"] as const) {
      if (hasOwn(parsed.body, key) && parsed.body[key] !== null && typeof parsed.body[key] !== "string") {
        return jsonError(c, "invalid_period", 400);
      }
    }

    try {
      return c.json(
        createGoalsRepository(c.env.db).createGroup(parsed.body.name, {
          periodStart: hasOwn(parsed.body, "periodStart") ? (parsed.body.periodStart as string | null) : undefined,
          periodEnd: hasOwn(parsed.body, "periodEnd") ? (parsed.body.periodEnd as string | null) : undefined,
        }),
        201,
      );
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/goals/groups/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const body = parsed.body;
    if (hasOwn(body, "name") && typeof body.name !== "string") return jsonError(c, "invalid_name", 400);
    for (const key of ["periodStart", "periodEnd"] as const) {
      if (hasOwn(body, key) && body[key] !== null && typeof body[key] !== "string") {
        return jsonError(c, "invalid_period", 400);
      }
    }
    if (hasOwn(body, "archived") && typeof body.archived !== "boolean") {
      return jsonError(c, "invalid_archived", 400);
    }
    if (hasOwn(body, "position") && typeof body.position !== "number") {
      return jsonError(c, "invalid_position", 400);
    }
    if (
      !hasOwn(body, "name") &&
      !hasOwn(body, "periodStart") &&
      !hasOwn(body, "periodEnd") &&
      !hasOwn(body, "archived") &&
      !hasOwn(body, "position")
    ) {
      return jsonError(c, "invalid_body", 400);
    }

    try {
      const input: Parameters<ReturnType<typeof createGoalsRepository>["updateGroup"]>[1] = {};
      if (hasOwn(body, "name")) input.name = body.name as string;
      if (hasOwn(body, "periodStart")) input.periodStart = body.periodStart as string | null;
      if (hasOwn(body, "periodEnd")) input.periodEnd = body.periodEnd as string | null;
      if (hasOwn(body, "archived")) input.archived = body.archived as boolean;
      if (hasOwn(body, "position")) input.position = body.position as number;
      return c.json(createGoalsRepository(c.env.db).updateGroup(c.req.param("id"), input), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/goals/groups/:id", (c) => {
    try {
      createGoalsRepository(c.env.db).removeGroup(c.req.param("id"));
      return c.json({ deleted: c.req.param("id") }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/goals/groups/:id/goals", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (!hasOwn(parsed.body, "title") || typeof parsed.body.title !== "string") {
      return jsonError(c, "invalid_title", 400);
    }

    try {
      return c.json(createGoalsRepository(c.env.db).createGoal(c.req.param("id"), parsed.body.title), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/goals/items/:id", (c) => {
    try {
      return c.json(createGoalsRepository(c.env.db).getGoal(c.req.param("id")), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/goals/items/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const body = parsed.body;
    if (hasOwn(body, "title") && typeof body.title !== "string") return jsonError(c, "invalid_title", 400);
    if (hasOwn(body, "content") && (!isObject(body.content) || !isJsonSerializable(body.content))) {
      return jsonError(c, "invalid_content", 400);
    }
    if (hasOwn(body, "categoryName") && body.categoryName !== null && typeof body.categoryName !== "string") {
      return jsonError(c, "invalid_category", 400);
    }
    if (hasOwn(body, "tagNames") && (!Array.isArray(body.tagNames) || body.tagNames.some((name) => typeof name !== "string"))) {
      return jsonError(c, "invalid_tags", 400);
    }
    if (hasOwn(body, "dueDate") && body.dueDate !== null && typeof body.dueDate !== "string") {
      return jsonError(c, "invalid_due_date", 400);
    }
    if (hasOwn(body, "status") && typeof body.status !== "string") {
      return jsonError(c, "invalid_status", 400);
    }

    const input: UpdateGoalInput = {};
    if (hasOwn(body, "title")) input.title = body.title as string;
    if (hasOwn(body, "content")) input.content = body.content;
    if (hasOwn(body, "categoryName")) input.categoryName = body.categoryName as string | null;
    if (hasOwn(body, "tagNames")) input.tagNames = body.tagNames as string[];
    if (hasOwn(body, "dueDate")) input.dueDate = body.dueDate as string | null;
    if (hasOwn(body, "status")) input.status = body.status as "todo" | "doing" | "done";

    try {
      return c.json(createGoalsRepository(c.env.db).updateGoal(c.req.param("id"), input), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/goals/items/:id", (c) => {
    try {
      createGoalsRepository(c.env.db).removeGoal(c.req.param("id"));
      return c.json({ deleted: c.req.param("id") }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/goals/vocabulary", (c) => {
    try {
      return c.json(createGoalsRepository(c.env.db).getVocabulary(), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  return routes;
}
