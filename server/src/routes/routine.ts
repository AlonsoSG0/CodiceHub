import { Hono } from "hono";
import type { ChubDatabase } from "../db/client.js";
import { createRoutineRepository, RoutineError } from "../routine/repository.js";

type Env = { Bindings: { db: ChubDatabase } };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const parseBody = async (c: { req: { json: () => Promise<unknown> } }) => { try { return await c.req.json(); } catch { return undefined; } };

export function createRoutineRoutes(): Hono<Env> {
  const routes = new Hono<Env>();
  const handle = (operation: () => unknown, c: any) => { try { return c.json(operation(), 200); } catch (error) { if (!(error instanceof RoutineError)) throw error; const status = error.code === "block_not_found" ? 404 : 400; return c.json({ error: error.code }, status); } };
  routes.get("/routine/link-targets", (c) => handle(() => createRoutineRepository(c.env.db).linkTargets(), c));
  routes.get("/routine", (c) => handle(() => createRoutineRepository(c.env.db).snapshot(), c));
  routes.put("/routine/settings", async (c) => { const body = await parseBody(c); if (!isObject(body)) return c.json({error:"invalid_body"},400); return handle(() => createRoutineRepository(c.env.db).updateSettings(body),c); });
  routes.post("/routine/days/:weekday/blocks", async (c) => { const body=await parseBody(c); if(!isObject(body))return c.json({error:"invalid_body"},400); return handle(()=>createRoutineRepository(c.env.db).createBlock(Number(c.req.param("weekday")),body),c); });
  routes.patch("/routine/blocks/:id", async (c) => { const body=await parseBody(c); if(!isObject(body))return c.json({error:"invalid_body"},400); return handle(()=>createRoutineRepository(c.env.db).updateBlock(c.req.param("id"),body),c); });
  routes.delete("/routine/blocks/:id", (c)=>handle(()=>createRoutineRepository(c.env.db).deleteBlock(c.req.param("id")),c));
  routes.post("/routine/days/:weekday/repeat", (c)=>handle(()=>createRoutineRepository(c.env.db).repeat(Number(c.req.param("weekday"))),c));
  routes.delete("/routine/days/:weekday", (c)=>handle(()=>createRoutineRepository(c.env.db).clearDay(Number(c.req.param("weekday"))),c));
  routes.put("/routine/blocks/:id/occurrences/:date", async (c)=>{const body=await parseBody(c);if(!isObject(body))return c.json({error:"invalid_body"},400);return handle(()=>createRoutineRepository(c.env.db).setOccurrence(c.req.param("id"),c.req.param("date"),body),c);});
  return routes;
}
