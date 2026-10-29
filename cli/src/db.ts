import { Database, type SQLQueryBindings } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { applyMigrations, configureConnection } from "../../server/src/db/core.js";
import type { ChubDatabase } from "../../server/src/db/client.js";
import * as schema from "../../server/src/db/schema.js";

export function createCliDb(
  path: string,
  migrationsDir: string,
  options: { shutdown?: "checkpoint" | "plain" } = {},
): { db: ChubDatabase; close: () => void } {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const client = new Database(path);
  const syncClient = {
    name: client.filename,
    prepare: (sql: string) => {
      const statement = client.prepare(sql);
      return {
        run: (...values: SQLQueryBindings[]) => statement.run(...values),
        get: (...values: SQLQueryBindings[]) => {
          const row = statement.get(...values);
          return row !== null && typeof row === "object" ? row : undefined;
        },
        all: (...values: SQLQueryBindings[]) => statement.all(...values).filter((row): row is object => row !== null && typeof row === "object"),
      };
    },
    exec: (sql: string) => client.exec(sql),
    pragma: (source: string, options?: { simple?: boolean }) => {
      if (source.trim() === "user_version") {
        const result = client.query("PRAGMA user_version").get() as { user_version: number };
        return options?.simple ? result.user_version : result;
      }
      client.exec(`PRAGMA ${source}`);
      return undefined;
    },
    transaction: <T>(fn: () => T) => ({ immediate: () => client.transaction(fn).immediate() }),
    close: () => {
      if (options.shutdown !== "plain") {
        client.query("PRAGMA wal_checkpoint(TRUNCATE)").all();
        client.query("PRAGMA journal_mode=DELETE").get();
      }
      client.close();
    },
  };
  try {
    configureConnection(syncClient);
    applyMigrations(syncClient, migrationsDir);
    // SAFETY: The Bun driver and Node driver expose the same application-facing Drizzle database API.
    const db = drizzle(client, { schema }) as unknown as ChubDatabase;
    return { db, close: syncClient.close };
  } catch (error) {
    client.close();
    throw error;
  }
}
