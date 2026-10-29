import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Hono } from "hono";
import type { ChubDatabase } from "../db/client.js";

type AppEnv = { Bindings: { db: ChubDatabase } };
const backupName = /^chub-\d{8}-\d{6}(-\d+)?\.db$/;

function directory(db: ChubDatabase): string {
  // SAFETY: Node and Bun expose the live database path under these respective properties.
  const client = db.$client as unknown as { name?: string; filename?: string };
  const name = client.name ?? client.filename;
  if (!name) throw new Error("SQLite database path unavailable");
  return name === ":memory:" ? resolve(tmpdir(), "chub", "backups") : resolve(dirname(resolve(name)), "backups");
}

function list(dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => backupName.test(name)).map((name) => {
    const stat = statSync(join(dir, name));
    return { name, bytes: stat.size, createdAt: stat.mtime.toISOString(), mtime: stat.mtimeMs };
  }).sort ( (a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
}

function rotate(dir: string) {
  for (const item of list(dir).slice(3)) unlinkSync(join(dir, item.name));
}

function create(db: ChubDatabase, dir: string) {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  let name = `chub-${stamp}.db`;
  for (let i = 1; existsSync(join(dir, name)); i++) name = `chub-${stamp}-${i}.db`;
  db.$client.prepare("VACUUM INTO ?").run(join(dir, name));
  return name;
}

function quote(name: string) { return `"${name.replaceAll('"', '""')}"`; }

export function createBackupRoutes() {
  const routes = new Hono<AppEnv>();
  routes.get("/backups", (c) => c.json({ backups: list(directory(c.env.db)).map((entry) => ({ name: entry.name, bytes: entry.bytes, createdAt: entry.createdAt })) }));
  routes.post("/backups", (c) => {
    const dir = directory(c.env.db);
    const name = create(c.env.db, dir);
    rotate(dir);
    return c.json({ name }, 201);
  });
  routes.post("/backups/:name/restore", (c) => {
    const name = c.req.param("name");
    if (!backupName.test(name)) return c.json({ error: "invalid_name" }, 400);
    const db = c.env.db;
    const dir = directory(db);
    const path = join(dir, name);
    if (!existsSync(path)) return c.json({ error: "backup_not_found" }, 404);
    create(db, dir);
    const client = db.$client;
    let attached = false;
    try {
      // The attached database is only read; all restore writes target main.
      client.prepare("ATTACH DATABASE ? AS backup").run(path);
      attached = true;
      const mainVersion = (client.prepare("PRAGMA main.user_version").get() as { user_version: number }).user_version;
      const backupVersion = (client.prepare("PRAGMA backup.user_version").get() as { user_version: number }).user_version;
      if (mainVersion !== backupVersion) return c.json({ error: "backup_schema_mismatch" }, 409);
      const tables = client.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'pages_fts_%' AND name != 'pages_fts'").all() as { name: string }[];
      const foreignKeys = (client.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys;
      client.exec("PRAGMA foreign_keys = OFF");
      try {
        client.transaction(() => {
          for (const { name: table } of tables) {
            // Names are read from sqlite_master and escaped as SQLite identifiers.
            const sql = `DELETE FROM main.${quote(table)}`;
            client.prepare(sql).run();
          }
          for (const { name: table } of tables) {
            // Identifiers come exclusively from sqlite_master and are SQL-quoted.
            const columns = table === "pages" ? `(rowid, ${pagesColumns(client)})` : "";
            const rowid = table === "pages" ? "rowid, " : "";
            const sql = `INSERT INTO main.${quote(table)}${columns} SELECT ${rowid}* FROM backup.${quote(table)}`;
            client.prepare(sql).run();
          }
          client.exec("INSERT INTO main.pages_fts(pages_fts) VALUES('rebuild')");
          if (client.prepare("PRAGMA main.foreign_key_check").all().length) throw new Error("Backup violates foreign keys");
        }).immediate();
      } finally {
        if (foreignKeys) client.exec("PRAGMA foreign_keys = ON");
      }
      return c.json({ restored: name });
    } finally {
      if (attached) client.exec("DETACH DATABASE backup");
      rotate(dir);
    }
  });
  return routes;
}

function pagesColumns(client: ChubDatabase["$client"]) {
  return (client.prepare("PRAGMA main.table_info(pages)").all() as { name: string }[]).map(({ name }) => quote(name)).join(", ");
}
