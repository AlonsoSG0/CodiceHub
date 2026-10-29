import { Hono, type Context } from "hono";
import type { ChubDatabase } from "../db/client.js";
import {
  createPagesRepository,
  PageError,
  type CreatePageInput,
  type MovePageInput,
  type UpdatePageInput,
} from "../pages/repository.js";
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
  if (!(error instanceof PageError)) throw error;
  if (error.code === "page_not_found" || error.code === "section_not_found") return jsonError(c, error.code, 404);
  if (error.code === "parent_not_found" || error.code === "cannot_move_into_descendant") {
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

function isJsonSerializable(value: unknown): boolean {
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}


export function createPagesRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  const readName = (body: JsonObject): string | null => {
    if (typeof body.name !== "string") return null;
    const name = body.name.trim().slice(0, 80);
    return name === "" ? null : name;
  };

  routes.get("/sections", (c) => {
    try {
      return c.json({ sections: createPagesRepository(c.env.db).sections() }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/sections", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const name = readName(parsed.body);
    if (name === null) return jsonError(c, "invalid_name", 400);

    try {
      return c.json(createPagesRepository(c.env.db).createSection(name), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/sections/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const name = readName(parsed.body);
    if (name === null) return jsonError(c, "invalid_name", 400);

    try {
      return c.json(createPagesRepository(c.env.db).renameSection(c.req.param("id"), name), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/sections/:id/move", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (!hasOwn(parsed.body, "position") || typeof parsed.body.position !== "number" || !Number.isInteger(parsed.body.position)) {
      return jsonError(c, "invalid_position", 400);
    }

    try {
      return c.json(
        { sections: createPagesRepository(c.env.db).moveSection(c.req.param("id"), parsed.body.position as number) },
        200,
      );
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/sections/:id", (c) => {
    try {
      return c.json({ deleted: createPagesRepository(c.env.db).deleteSection(c.req.param("id")) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/pages/tree", (c) => {
    try {
      return c.json({ pages: createPagesRepository(c.env.db).tree() }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/pages/trash", (c) => {
    try {
      return c.json({ pages: createPagesRepository(c.env.db).listTrash() }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/pages/:id", (c) => {
    try {
      return c.json(createPagesRepository(c.env.db).get(c.req.param("id")), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/pages", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const body = parsed.body;
    if (hasOwn(body, "title") && typeof body.title !== "string") return jsonError(c, "invalid_title", 400);
    if (hasOwn(body, "icon") && !isValidIcon(body.icon)) return jsonError(c, "invalid_icon", 400);
    if (hasOwn(body, "parentId") && body.parentId !== null && typeof body.parentId !== "string") {
      return jsonError(c, "invalid_parent_id", 400);
    }
    if (hasOwn(body, "position") && (typeof body.position !== "number" || !Number.isInteger(body.position))) {
      return jsonError(c, "invalid_position", 400);
    }

    const input: CreatePageInput = {};
    if (hasOwn(body, "parentId")) input.parentId = body.parentId as string | null;
    if (hasOwn(body, "sectionId")) {
      if (body.sectionId !== null && typeof body.sectionId !== "string") return jsonError(c, "invalid_section_id", 400);
      input.sectionId = body.sectionId as string | null;
    }
    if (hasOwn(body, "title")) input.title = body.title as string;
    if (hasOwn(body, "icon")) input.icon = body.icon === null ? null : (body.icon as string).trim();
    if (hasOwn(body, "position")) input.position = body.position as number;

    try {
      return c.json(createPagesRepository(c.env.db).create(input), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/pages/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const body = parsed.body;
    if (hasOwn(body, "title") && typeof body.title !== "string") return jsonError(c, "invalid_title", 400);
    if (hasOwn(body, "icon") && !isValidIcon(body.icon)) return jsonError(c, "invalid_icon", 400);
    if (hasOwn(body, "content") && !isJsonSerializable(body.content)) return jsonError(c, "invalid_content", 400);
    if (hasOwn(body, "favorite") && typeof body.favorite !== "boolean") return jsonError(c, "invalid_favorite", 400);

    const input: UpdatePageInput = {};
    if (hasOwn(body, "title")) input.title = body.title as string;
    if (hasOwn(body, "icon")) input.icon = body.icon === null ? null : (body.icon as string).trim();
    if (hasOwn(body, "content")) input.content = body.content;
    if (hasOwn(body, "favorite")) input.favorite = body.favorite as boolean;

    try {
      const repository = createPagesRepository(c.env.db);
      if (!hasOwn(body, "title") && !hasOwn(body, "icon") && !hasOwn(body, "content") && !hasOwn(body, "favorite")) {
        return c.json(repository.get(c.req.param("id")), 200);
      }
      const updated = repository.update(c.req.param("id"), input);
      return c.json(updated === undefined || Array.isArray(updated) ? repository.get(c.req.param("id")) : updated, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/pages/:id/backlinks", (c) => {
    try {
      return c.json({ backlinks: createPagesRepository(c.env.db).backlinks(c.req.param("id")) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/pages/:id/duplicate", (c) => {
    try {
      return c.json(createPagesRepository(c.env.db).duplicate(c.req.param("id")), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/pages/:id/move", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);

    const body = parsed.body;
    if (!hasOwn(body, "position") || typeof body.position !== "number" || !Number.isInteger(body.position)) {
      return jsonError(c, "invalid_position", 400);
    }
    if (!hasOwn(body, "parentId") || (body.parentId !== null && typeof body.parentId !== "string")) {
      return jsonError(c, "invalid_parent_id", 400);
    }

    const input: MovePageInput = { parentId: body.parentId as string | null, position: body.position as number };
    if (hasOwn(body, "sectionId")) {
      if (body.sectionId !== null && typeof body.sectionId !== "string") return jsonError(c, "invalid_section_id", 400);
      input.sectionId = body.sectionId as string | null;
    }
    try {
      return c.json({ pages: createPagesRepository(c.env.db).move(c.req.param("id"), input) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/pages/:id", (c) => {
    try {
      return c.json({ deleted: createPagesRepository(c.env.db).softDelete(c.req.param("id")) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/pages/:id/restore", (c) => {
    try {
      return c.json({ restored: createPagesRepository(c.env.db).restore(c.req.param("id")) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/pages/:id/purge", (c) => {
    try {
      return c.json({ purged: createPagesRepository(c.env.db).purge(c.req.param("id")) }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  return routes;
}
