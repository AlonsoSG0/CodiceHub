import { serve } from "@hono/node-server";
import { createDb } from "./db/client.js";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.CHUB_DB_PATH ?? "data/chub.db";
const db = createDb(dbPath);

serve({ fetch: (request) => app.fetch(request, { db }), port });
