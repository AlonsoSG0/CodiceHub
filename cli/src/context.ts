import { mkdir, readdir, rm } from "node:fs/promises";
import type { Dirent } from "node:fs";
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
  await pruneRuntime(home);
  return web;
}

/**
 * Drop the runtime extracted for any other build, so updating chub does not keep a copy per version.
 * Best effort by design: a leftover that cannot be removed is worth a retry on the next start, never an exit.
 * The cost is that a second instance still running an older build loses its assets; restarting it fixes that.
 */
export async function pruneRuntime(home: string, keep: string = assetsHash): Promise<void> {
  const root = join(home, "runtime");
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  const stale = entries.filter((entry) => entry.isDirectory() && entry.name !== keep);
  await Promise.all(stale.map((entry) => rm(join(root, entry.name), { recursive: true, force: true }).catch(() => undefined)));
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
