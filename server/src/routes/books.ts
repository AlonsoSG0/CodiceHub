import { Hono, type Context } from "hono";
import type { ChubDatabase } from "../db/client.js";
import { createBooksRepository, BookError, type CreateBookInput, type UpdateBookInput } from "../books/repository.js";

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
  if (!(error instanceof BookError)) throw error;
  if (error.code === "book_not_found" || error.code === "notebook_not_found") return jsonError(c, error.code, 404);
  return jsonError(c, error.code, 400);
}
async function parseJson(c: Context<AppEnv>): Promise<{ body: unknown } | { response: Response }> {
  try {
    return { body: await c.req.json() };
  } catch {
    return { response: jsonError(c, "invalid_json", 400) };
  }
}

export function createBooksRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/books", (c) => {
    try {
      return c.json({ books: createBooksRepository(c.env.db).list() }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.get("/books/:id", (c) => {
    try {
      return c.json(createBooksRepository(c.env.db).get(c.req.param("id")), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/books", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const body = parsed.body;
    if (hasOwn(body, "title") && typeof body.title !== "string") return jsonError(c, "invalid_title", 400);
    if (hasOwn(body, "author") && body.author !== null && typeof body.author !== "string") return jsonError(c, "invalid_author", 400);
    if (hasOwn(body, "score") && body.score !== null && typeof body.score !== "number") return jsonError(c, "invalid_score", 400);
    if (hasOwn(body, "status") && typeof body.status !== "string") return jsonError(c, "invalid_status", 400);
    if (hasOwn(body, "startDate") && body.startDate !== null && typeof body.startDate !== "string") return jsonError(c, "invalid_start_date", 400);
    if (hasOwn(body, "completedDate") && body.completedDate !== null && typeof body.completedDate !== "string") return jsonError(c, "invalid_completed_date", 400);
    if (hasOwn(body, "link") && body.link !== null && typeof body.link !== "string") return jsonError(c, "invalid_link", 400);
    if (hasOwn(body, "expectation") && body.expectation !== null && typeof body.expectation !== "string") return jsonError(c, "invalid_expectation", 400);
    if (hasOwn(body, "coverUrl") && body.coverUrl !== null && typeof body.coverUrl !== "string") return jsonError(c, "invalid_cover_url", 400);

    const input: CreateBookInput = {};
    if (hasOwn(body, "title")) input.title = body.title as string;
    if (hasOwn(body, "author")) input.author = body.author === null ? null : (body.author as string);
    if (hasOwn(body, "score")) input.score = body.score as number | null;
    if (hasOwn(body, "status")) input.status = body.status as CreateBookInput["status"];
    if (hasOwn(body, "startDate")) input.startDate = body.startDate as string | null;
    if (hasOwn(body, "completedDate")) input.completedDate = body.completedDate as string | null;
    if (hasOwn(body, "link")) input.link = body.link as string | null;
    if (hasOwn(body, "expectation")) input.expectation = body.expectation as string | null;
    if (hasOwn(body, "coverUrl")) input.coverUrl = body.coverUrl === null ? null : (body.coverUrl as string).trim();

    try {
      return c.json(createBooksRepository(c.env.db).create(input), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/books/:id", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    const body = parsed.body;
    if (hasOwn(body, "title") && typeof body.title !== "string") return jsonError(c, "invalid_title", 400);
    if (hasOwn(body, "author") && body.author !== null && typeof body.author !== "string") return jsonError(c, "invalid_author", 400);
    if (hasOwn(body, "score") && body.score !== null && typeof body.score !== "number") return jsonError(c, "invalid_score", 400);
    if (hasOwn(body, "status") && typeof body.status !== "string") return jsonError(c, "invalid_status", 400);
    if (hasOwn(body, "startDate") && body.startDate !== null && typeof body.startDate !== "string") return jsonError(c, "invalid_start_date", 400);
    if (hasOwn(body, "completedDate") && body.completedDate !== null && typeof body.completedDate !== "string") return jsonError(c, "invalid_completed_date", 400);
    if (hasOwn(body, "link") && body.link !== null && typeof body.link !== "string") return jsonError(c, "invalid_link", 400);
    if (hasOwn(body, "expectation") && body.expectation !== null && typeof body.expectation !== "string") return jsonError(c, "invalid_expectation", 400);
    if (hasOwn(body, "coverUrl") && body.coverUrl !== null && typeof body.coverUrl !== "string") return jsonError(c, "invalid_cover_url", 400);

    const input: UpdateBookInput = {};
    if (hasOwn(body, "title")) input.title = body.title as string;
    if (hasOwn(body, "author")) input.author = body.author as string | null;
    if (hasOwn(body, "score")) input.score = body.score as number | null;
    if (hasOwn(body, "status")) input.status = body.status as UpdateBookInput["status"];
    if (hasOwn(body, "startDate")) input.startDate = body.startDate as string | null;
    if (hasOwn(body, "completedDate")) input.completedDate = body.completedDate as string | null;
    if (hasOwn(body, "link")) input.link = body.link as string | null;
    if (hasOwn(body, "expectation")) input.expectation = body.expectation as string | null;
    if (hasOwn(body, "coverUrl")) input.coverUrl = body.coverUrl === null ? null : (body.coverUrl as string).trim();

    try {
      return c.json(createBooksRepository(c.env.db).update(c.req.param("id"), input), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  // The notebook of one book: a single page with no tree of its own.
  routes.get("/books/:id/notebook", (c) => {
    try {
      return c.json(createBooksRepository(c.env.db).getNotebook(c.req.param("id")), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.post("/books/:id/notebook", (c) => {
    try {
      return c.json(createBooksRepository(c.env.db).createNotebook(c.req.param("id")), 201);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.patch("/books/:id/notebook", async (c) => {
    const parsed = await parseJson(c);
    if ("response" in parsed) return parsed.response;
    if (!isObject(parsed.body)) return jsonError(c, "invalid_body", 400);
    if (!hasOwn(parsed.body, "content")) return jsonError(c, "invalid_content", 400);

    try {
      return c.json(createBooksRepository(c.env.db).updateNotebook(c.req.param("id"), parsed.body.content), 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  routes.delete("/books/:id", (c) => {
    try {
      createBooksRepository(c.env.db).remove(c.req.param("id"));
      return c.json({ deleted: c.req.param("id") }, 200);
    } catch (error) {
      return repositoryError(c, error);
    }
  });

  return routes;
}
