import { Hono, type Context } from "hono";
import type { ChubDatabase } from "../db/client.js";
import { PageError, createPagesRepository } from "../pages/repository.js";
import { exportFilename, toMarkdown } from "./markdown.js";

type AppEnv = { Bindings: { db: ChubDatabase } };

function pageNotFound(c: Context<AppEnv>): Response {
  return c.json({ error: "page_not_found" }, 404);
}

export function createExportRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/pages/:id/export.md", (c) => {
    try {
      const page = createPagesRepository(c.env.db).get(c.req.param("id"));
      return c.body(toMarkdown(page.content), 200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(page.title)}"`,
      });
    } catch (error) {
      if (error instanceof PageError && error.code === "page_not_found") return pageNotFound(c);
      throw error;
    }
  });

  return routes;
}
