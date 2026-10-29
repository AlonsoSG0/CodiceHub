import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { applyMigrations, configureConnection } from "./core.js";

export type ChubDatabase = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const migrationsFolder = fileURLToPath(new URL("../../drizzle/", import.meta.url));

export function createDb(path: string, migrationsDir = migrationsFolder): ChubDatabase {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });

  const client = new Database(path);
  const syncClient = {
    name: client.name,
    prepare: (sql: string) => {
      const statement = client.prepare(sql);
      return {
        run: (...values: unknown[]) => statement.run(...values),
        get: (...values: unknown[]) => {
          const row = statement.get(...values);
          return row !== null && typeof row === "object" ? row : undefined;
        },
        all: (...values: unknown[]) => statement.all(...values).filter((row): row is object => row !== null && typeof row === "object"),
      };
    },
    exec: (sql: string) => client.exec(sql),
    pragma: (source: string, options?: { simple?: boolean }) => {
      const result = client.pragma(source, options);
      return source.startsWith("user_version") && options?.simple ? result as number : undefined;
    },
    transaction: <T>(fn: () => T) => client.transaction(fn),
    close: () => client.close(),
  };
  configureConnection(syncClient);

  try {
    applyMigrations(syncClient, migrationsDir);
    return drizzle(client, { schema });
  } catch (error) {
    client.close();
    throw error;
  }
}
