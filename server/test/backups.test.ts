import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createDb, type ChubDatabase } from "../src/db/client.js";

describe("backups API", () => {
  let db: ChubDatabase;
  let dir: string;
  const request = (path: string, init?: RequestInit) => app.request(path, init, { db });
  const post = (path: string, body?: unknown) => request(path, { method: "POST", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const list = async () => (await (await request("/api/backups")).json()) as { backups: { name: string; bytes: number; createdAt: string }[] };
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "chub-backup-test-")); db = createDb(join(dir, "chub.db")); });
  afterEach(() => db.$client.close());

  it("creates sized backups and rotates five creations to the newest three", async () => {
    const names: string[] = [];
    for (let i = 0; i < 5; i++) {
      expect((await post("/api/backups")).status).toBe(201);
      const backups = (await list()).backups;
      expect(backups[0]!.bytes).toBeGreaterThan(0);
      names.push(backups[0]!.name);
    }
    expect((await list()).backups.map((b) => b.name)).toEqual(names.slice(-3).reverse());
    expect(readdirSync(join(dir, "backups")).sort()).toEqual(names.slice(-3).sort());
  });

  it("restores the oldest of three, backs up current state and rebuilds search", async () => {
    const page = await (await post("/api/pages", { title: "Restoredneedle" })).json() as { id: string };
    await post("/api/backups");
    const oldest = (await list()).backups[0]!.name;
    await post("/api/backups"); await post("/api/backups");
    await request(`/api/pages/${page.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Changedneedle" }) });
    const response = await post(`/api/backups/${oldest}/restore`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ restored: oldest });
    expect((await (await request(`/api/pages/${page.id}`)).json() as { title: string }).title).toBe("Restoredneedle");
    expect((await (await request("/api/search?q=Restoredneedle")).json() as { results: unknown[] }).results).toHaveLength(1);
    const backups = (await list()).backups;
    expect(backups).toHaveLength(3);
    expect(readdirSync(join(dir, "backups"))).toHaveLength(3);
    const safety = new Database(join(dir, "backups", backups[0]!.name), { readonly: true });
    expect((safety.prepare("SELECT title FROM pages WHERE id = ?").get(page.id) as { title: string }).title).toBe("Changedneedle");
    safety.close();
    // A second restore proves the first request released its attached database.
    expect((await post(`/api/backups/${backups[0]!.name}/restore`)).status).toBe(200);
  });

  it("rejects invalid and missing names without changing data", async () => {
    const invalid = await post("/api/backups/not-a-backup/restore");
    expect(invalid.status).toBe(400); expect(await invalid.json()).toEqual({ error: "invalid_name" });
    const missing = await post("/api/backups/chub-20260101-000000.db/restore");
    expect(missing.status).toBe(404); expect(await missing.json()).toEqual({ error: "backup_not_found" });
    expect((await list()).backups).toEqual([]);
  });

  it("rejects mismatched versions without changing live state", async () => {
    await post("/api/backups");
    const name = (await list()).backups[0]!.name;
    const backup = new Database(join(dir, "backups", name)); backup.pragma("user_version = 9999"); backup.close();
    const page = await (await post("/api/pages", { title: "Keep me" })).json() as { id: string };
    const response = await post(`/api/backups/${name}/restore`);
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "backup_schema_mismatch" });
    expect((await (await request(`/api/pages/${page.id}`)).json() as { title: string }).title).toBe("Keep me");
    // A repeated mismatch must not fail because the first attachment was left open.
    expect((await post(`/api/backups/${name}/restore`)).status).toBe(409);
  });
});
