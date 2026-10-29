import { Hono, type Context } from "hono";
import type { ChubDatabase } from "../db/client.js";
import {
  ChecklistError,
  createChecklistsRepository,
  type UpdateChecklistItemInput,
} from "../checklists/repository.js";

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
  if (!(error instanceof ChecklistError)) throw error;
  if (error.code === "checklist_not_found" || error.code === "item_not_found") {
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

export function createChecklistsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/checklists", (c) => {
    try {
      return c.json({ checklists: createChecklistsRepository(c.env.db).listChecklists() }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/checklists", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (!hasOwn(parsed.body, "name") || typeof parsed.body.name !== "string") {
      return jsonError(c, "invalid_name", 400);
    }

    try {
      return c.json(createChecklistsRepository(c.env.db).createChecklist(parsed.body.name), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/checklists/prune", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (!hasOwn(parsed.body, "olderThanDays") || typeof parsed.body.olderThanDays !== "number") {
      return jsonError(c, "invalid_retention", 400);
    }
    if (!hasOwn(parsed.body, "scope") || typeof parsed.body.scope !== "string") {
      return jsonError(c, "invalid_scope", 400);
    }

    try {
      const result = createChecklistsRepository(c.env.db).prune({
        olderThanDays: parsed.body.olderThanDays,
        scope: parsed.body.scope as "all" | "completed",
      });
      return c.json(result, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/checklists/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (!hasOwn(parsed.body, "name") || typeof parsed.body.name !== "string") {
      return jsonError(c, "invalid_name", 400);
    }

    try {
      return c.json(createChecklistsRepository(c.env.db).renameChecklist(c.req.param("id"), parsed.body.name), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/checklists/:id", (c) => {
    try {
      createChecklistsRepository(c.env.db).removeChecklist(c.req.param("id"));
      return c.json({ deleted: c.req.param("id") }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/checklists/:id/items", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (!hasOwn(parsed.body, "text") || typeof parsed.body.text !== "string") {
      return jsonError(c, "invalid_text", 400);
    }

    try {
      return c.json(createChecklistsRepository(c.env.db).addItem(c.req.param("id"), parsed.body.text), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/checklists/items/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (hasOwn(parsed.body, "text") && typeof parsed.body.text !== "string") {
      return jsonError(c, "invalid_text", 400);
    }
    if (hasOwn(parsed.body, "done") && typeof parsed.body.done !== "boolean") {
      return jsonError(c, "invalid_done", 400);
    }
    if (hasOwn(parsed.body, "dueDate")
      && parsed.body.dueDate !== null
      && typeof parsed.body.dueDate !== "string") {
      return jsonError(c, "invalid_due_date", 400);
    }
    if (hasOwn(parsed.body, "priority") && typeof parsed.body.priority !== "string") {
      return jsonError(c, "invalid_priority", 400);
    }
    if (hasOwn(parsed.body, "recurrence") && typeof parsed.body.recurrence !== "string") {
      return jsonError(c, "invalid_recurrence", 400);
    }
    if (hasOwn(parsed.body, "goalId")
      && parsed.body.goalId !== null
      && typeof parsed.body.goalId !== "string") {
      return jsonError(c, "invalid_goal", 400);
    }

    const input: UpdateChecklistItemInput = {};
    if (hasOwn(parsed.body, "text")) input.text = parsed.body.text as string;
    if (hasOwn(parsed.body, "done")) input.done = parsed.body.done as boolean;
    if (hasOwn(parsed.body, "dueDate")) input.dueDate = parsed.body.dueDate as string | null;
    if (hasOwn(parsed.body, "priority")) input.priority = parsed.body.priority as UpdateChecklistItemInput["priority"];
    if (hasOwn(parsed.body, "recurrence")) input.recurrence = parsed.body.recurrence as UpdateChecklistItemInput["recurrence"];
    if (hasOwn(parsed.body, "goalId")) input.goalId = parsed.body.goalId as string | null;
    try {
      return c.json(createChecklistsRepository(c.env.db).updateItem(c.req.param("id"), input), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/checklists/:id/bulk", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (!hasOwn(parsed.body, "action") || typeof parsed.body.action !== "string") {
      return jsonError(c, "invalid_action", 400);
    }

    try {
      const checklist = createChecklistsRepository(c.env.db).bulk(
        c.req.param("id"),
        parsed.body.action as "complete-open" | "delete-completed",
      );
      return c.json(checklist, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/checklists/items/:id", (c) => {
    try {
      createChecklistsRepository(c.env.db).removeItem(c.req.param("id"));
      return c.json({ deleted: c.req.param("id") }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  return routes;
}
