import { Hono, type Context } from "hono";
import type { ChubDatabase } from "../db/client.js";
import { createPreferencesRepository, PreferenceError } from "../preferences/repository.js";

type AppEnv = { Bindings: { db: ChubDatabase } };
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function jsonError(c: Context<AppEnv>, error: string, status: 400): Response {
  return c.json({ error }, status);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredValue(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    throw new PreferenceError("invalid_value");
  }
}

export function createPreferencesRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/preferences", (c) => {
    try {
      const rows = createPreferencesRepository(c.env.db).readAll();
      const preferences = Object.fromEntries(rows.map((row) => [row.key, parseStoredValue(row.value)]));
      return c.json({ preferences }, 200);
    } catch (error) {
      if (error instanceof PreferenceError) return jsonError(c, error.code, 400);
      throw error;
    }
  });

  routes.put("/preferences/:key", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return jsonError(c, "invalid_value", 400);
    }
    const value = isObject(body) && Object.hasOwn(body, "value") ? body.value : undefined;

    try {
      return c.json(createPreferencesRepository(c.env.db).upsertOne(c.req.param("key"), value), 200);
    } catch (error) {
      if (error instanceof PreferenceError) return jsonError(c, error.code, 400);
      throw error;
    }
  });

  return routes;
}
