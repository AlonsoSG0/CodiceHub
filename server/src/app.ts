import { Hono } from "hono";
import type { ChubDatabase } from "./db/client.js";
import { createExportRoutes } from "./export/routes.js";
import { createProjectsRoutes } from "./routes/projects.js";
import { createHabitsRoutes } from "./routes/habits.js";
import { createRoutineRoutes } from "./routes/routine.js";
import { createBooksRoutes } from "./routes/books.js";
import { createBackupRoutes } from "./routes/backups.js";
import { createChecklistsRoutes } from "./routes/checklists.js";
import { createGoalsRoutes } from "./routes/goals.js";
import { createPagesRoutes } from "./routes/pages.js";
import { createPreferencesRoutes } from "./routes/preferences.js";
import { createSearchRoutes } from "./search/routes.js";
import { serveWebAsset } from "./static/serve.js";
import { createUploadRoutes } from "./uploads/routes.js";

type AppEnv = { Bindings: { db: ChubDatabase } };

function isPathUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export const app = new Hono<AppEnv>()
  .get("/api/health", (c) => c.json({ status: "ok" }, 200))
  .route("/api", createPagesRoutes())
  .route("/api", createPreferencesRoutes())
  .route("/api", createBackupRoutes())
  .route("/api", createHabitsRoutes())
  .route("/api", createRoutineRoutes())
  .route("/api", createBooksRoutes())
  .route("/api", createProjectsRoutes())
  .route("/api", createChecklistsRoutes())
  .route("/api", createGoalsRoutes())
  .route("/api", createSearchRoutes())
  .route("/api", createExportRoutes())
  .route("/", createUploadRoutes())
  .get("*", async (c) => {
    if (isPathUnder(c.req.path, "/api")) return c.json({ error: "not_found" }, 404);
    if (isPathUnder(c.req.path, "/uploads")) return c.body(null, 404);
    return (await serveWebAsset(c.req.path)) ?? c.notFound();
  });

app.notFound((c) => {
  if (isPathUnder(c.req.path, "/api")) return c.json({ error: "not_found" }, 404);
  return c.body(null, 404);
});
