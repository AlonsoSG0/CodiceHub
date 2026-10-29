import { Hono, type Context } from "hono";
import type { ChubDatabase } from "../db/client.js";
import {
  createHabitsRepository,
  HabitError,
  type AddHabitFieldInput,
  type CreateHabitInput,
  type UpdateHabitFieldInput,
  type UpdateHabitInput,
} from "../habits/repository.js";
import { isValidIcon } from "./icon.js";

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
  if (!(error instanceof HabitError)) throw error;
  if (error.code === "habit_not_found" || error.code === "field_not_found") {
    return jsonError(c, error.code, 404);
  }
  if (error.code === "habit_not_archived" || error.code === "invalid_value" || error.code === "invalid_date") {
    return jsonError(c, error.code, 400);
  }
  throw error;
}

async function parseJson(c: Context<AppEnv>): Promise<{ body: unknown } | { response: Response }> {
  try {
    return { body: await c.req.json() };
  } catch {
    return { response: jsonError(c, "invalid_json", 400) };
  }
}

function isHabitFieldKind(value: unknown): value is AddHabitFieldInput["kind"] {
  return value === "check" || value === "number" || value === "text";
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function createHabitsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/habits", (c) => {
    try {
      const archived = c.req.query("archived") === "1";
      const section = c.req.query("section");
      if (section !== undefined && section !== "habits" && section !== "books") {
        return jsonError(c, "invalid_section", 400);
      }
      return c.json({ habits: createHabitsRepository(c.env.db).list({ archived, section }) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  // Registered before `/habits/:id`, or Hono would read the literal `entries` as a habit id.
  routes.get("/habits/entries", (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (typeof from !== "string" || typeof to !== "string") return jsonError(c, "invalid_date", 400);

    try {
      return c.json({ entries: createHabitsRepository(c.env.db).listEntries({ from, to }) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/habits", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const body = parsed.body;
    if (hasOwn(body, "name") && typeof body.name !== "string") return jsonError(c, "invalid_name", 400);
    if (hasOwn(body, "icon") && !isValidIcon(body.icon)) return jsonError(c, "invalid_icon", 400);
    if (hasOwn(body, "position") && !isInteger(body.position)) return jsonError(c, "invalid_position", 400);
    if (hasOwn(body, "section") && body.section !== "habits" && body.section !== "books") {
      return jsonError(c, "invalid_section", 400);
    }

    const input: CreateHabitInput = {};
    if (hasOwn(body, "name")) input.name = body.name as string;
    if (hasOwn(body, "icon")) input.icon = body.icon === null ? null : (body.icon as string).trim();
    if (hasOwn(body, "position")) input.position = body.position as number;
    if (hasOwn(body, "section")) input.section = body.section as CreateHabitInput["section"];

    try {
      return c.json(createHabitsRepository(c.env.db).create(input), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/habits/:id", (c) => {
    try {
      return c.json(createHabitsRepository(c.env.db).get(c.req.param("id")), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/habits/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const body = parsed.body;
    if (hasOwn(body, "name") && typeof body.name !== "string") return jsonError(c, "invalid_name", 400);
    if (hasOwn(body, "icon") && !isValidIcon(body.icon)) return jsonError(c, "invalid_icon", 400);
    if (hasOwn(body, "archived") && typeof body.archived !== "boolean") return jsonError(c, "invalid_archived", 400);

    const input: UpdateHabitInput = {};
    if (hasOwn(body, "name")) input.name = body.name as string;
    if (hasOwn(body, "icon")) input.icon = body.icon === null ? null : (body.icon as string).trim();
    if (hasOwn(body, "archived")) input.archived = body.archived as boolean;

    try {
      return c.json(createHabitsRepository(c.env.db).update(c.req.param("id"), input), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.put("/habits/:id/entries/:date", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const values = parsed.body.values;
    if (!Array.isArray(values)) return jsonError(c, "invalid_value", 400);

    const parsedValues: Array<{ fieldId: string; value: boolean | number | string | null }> = [];
    for (const item of values) {
      if (!isObject(item) || typeof item.fieldId !== "string" || !hasOwn(item, "value")) {
        return jsonError(c, "invalid_value", 400);
      }
      parsedValues.push({ fieldId: item.fieldId, value: item.value as boolean | number | string | null });
    }

    try {
      const repository = createHabitsRepository(c.env.db);
      return c.json({ entries: repository.setEntries(c.req.param("id"), c.req.param("date"), parsedValues) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/habits/:id/fields", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const body = parsed.body;
    if (!isHabitFieldKind(body.kind)) return jsonError(c, "invalid_kind", 400);
    if (hasOwn(body, "label") && typeof body.label !== "string") return jsonError(c, "invalid_label", 400);
    if (hasOwn(body, "unit") && body.unit !== null && typeof body.unit !== "string") {
      return jsonError(c, "invalid_unit", 400);
    }
    if (hasOwn(body, "target") && !isFiniteNumberOrNull(body.target)) return jsonError(c, "invalid_target", 400);
    if (hasOwn(body, "position") && !isInteger(body.position)) return jsonError(c, "invalid_position", 400);

    const input: AddHabitFieldInput = { kind: body.kind };
    if (hasOwn(body, "label")) input.label = body.label as string;
    if (hasOwn(body, "unit")) input.unit = body.unit === null ? null : (body.unit as string).trim();
    if (hasOwn(body, "target")) input.target = body.target as number | null;
    if (hasOwn(body, "position")) input.position = body.position as number;

    try {
      return c.json(createHabitsRepository(c.env.db).addField(c.req.param("id"), input), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/habits/:id/fields/:fieldId", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const body = parsed.body;
    if (hasOwn(body, "label") && typeof body.label !== "string") return jsonError(c, "invalid_label", 400);
    if (hasOwn(body, "unit") && body.unit !== null && typeof body.unit !== "string") {
      return jsonError(c, "invalid_unit", 400);
    }
    if (hasOwn(body, "target") && !isFiniteNumberOrNull(body.target)) return jsonError(c, "invalid_target", 400);
    if (hasOwn(body, "position") && !isInteger(body.position)) return jsonError(c, "invalid_position", 400);

    const input: UpdateHabitFieldInput = {};
    if (hasOwn(body, "label")) input.label = body.label as string;
    if (hasOwn(body, "unit")) input.unit = body.unit === null ? null : (body.unit as string).trim();
    if (hasOwn(body, "target")) input.target = body.target as number | null;
    if (hasOwn(body, "position")) input.position = body.position as number;

    try {
      const repository = createHabitsRepository(c.env.db);
      const habit = repository.updateField(c.req.param("id"), c.req.param("fieldId"), input);
      return c.json(habit, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/habits/:id/fields/:fieldId", (c) => {
    try {
      const repository = createHabitsRepository(c.env.db);
      return c.json(repository.removeField(c.req.param("id"), c.req.param("fieldId")), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/habits/:id/purge", (c) => {
    try {
      return c.json({ purged: createHabitsRepository(c.env.db).purge(c.req.param("id")) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  return routes;
}
