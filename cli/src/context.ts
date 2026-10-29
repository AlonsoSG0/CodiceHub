import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ChubDatabase } from "../../server/src/db/client.js";
import { assetsHash } from "./asset-hash.js";
import { createCliDb } from "./db.js";
import { drizzleTarPath, webTarPath } from "./generated.js";

/** The directory that holds the database, uploads and the extracted runtime assets. */
export function dataHome(): string {
  return resolve(process.env.CHUB_HOME ?? join(homedir(), ".local", "share", "chub"));
}

function runtimePaths(home: string): { web: string; migrations: string } {
  const root = join(home, "runtime", assetsHash);
  return { web: join(root, "web"), migrations: join(root, "drizzle") };
}

async function extract(archivePath: string, target: string, marker: string): Promise<void> {
  if (await Bun.file(join(target, marker)).exists()) return;
  await mkdir(target, { recursive: true });
  await new Bun.Archive(await Bun.file(archivePath).arrayBuffer()).extract(target);
}

/** The embedded web build. Only the server path needs it, so data commands must not pay for it. */
export async function extractWeb(home: string): Promise<string> {
  const { web } = runtimePaths(home);
  await extract(webTarPath, web, "index.html");
  return web;
}

/** The embedded migrations. Every path that opens the database needs these. */
export async function extractMigrations(home: string): Promise<string> {
  const { migrations } = runtimePaths(home);
  await extract(drizzleTarPath, migrations, join("meta", "_journal.json"));
  return migrations;
}

/**
 * Open the data home database.
 *
 * `shutdown: "checkpoint"` is the server path, which owns the file and must leave no WAL behind.
 * `shutdown: "plain"` is the data-command path: it may run while the server holds the database, so it must not
 * switch the journal mode out from under a live connection.
 */
export async function openData(
  options: { shutdown?: "checkpoint" | "plain" } = {},
): Promise<{ home: string; db: ChubDatabase; close: () => void }> {
  const home = dataHome();
  const migrations = await extractMigrations(home);
  const { db, close } = createCliDb(join(home, "chub.db"), migrations, options);
  return { home, db, close };
}
