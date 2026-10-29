import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SyncRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SyncStatement {
  run(...values: unknown[]): SyncRunResult;
  get(...values: unknown[]): object | undefined;
  all(...values: unknown[]): object[];
}

export interface SyncClient {
  readonly name: string;
  prepare(sql: string): SyncStatement;
  exec(sql: string): void;
  pragma(source: string, options?: { simple?: boolean }): number | string | object | undefined;
  transaction<T>(fn: () => T): { immediate(): T };
  close(): void;
}

type MigrationJournal = { entries: Array<{ idx: number; tag: string }> };

export function applyMigrations(client: SyncClient, folder: string): void {
  const journalPath = join(folder, "meta", "_journal.json");
  let journal: MigrationJournal;
  try {
    journal = JSON.parse(readFileSync(journalPath, "utf8")) as MigrationJournal;
  } catch (cause) {
    throw new Error(`Could not read migration journal at ${journalPath}`, { cause });
  }
  let currentVersion = client.pragma("user_version", { simple: true }) as number;

  for (const entry of journal.entries) {
    if (entry.idx < currentVersion) continue;
    if (entry.idx !== currentVersion) throw new Error(`Migration sequence is not contiguous at ${entry.tag}`);

    const migration = readFileSync(join(folder, `${entry.tag}.sql`), "utf8");
    const statements = migration.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
    client.transaction(() => {
      for (const statement of statements) client.exec(statement);
      client.pragma(`user_version = ${entry.idx + 1}`);
    }).immediate();
    currentVersion = entry.idx + 1;
  }
}

export function configureConnection(client: SyncClient): void {
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  client.pragma("busy_timeout = 5000");
}
