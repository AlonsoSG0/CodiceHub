import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ChubDatabase } from "../../server/src/db/client.js";
import { assetsHash } from "./asset-hash.js";
import { createCliDb } from "./db.js";
import { drizzleTarPath, webTarPath } from "./generated.js";
import { isAlive } from "./process.js";

/**
 * The directory that holds the database, uploads and the extracted runtime assets.
 *
 * Windows gets %LOCALAPPDATA%\chub instead of a hidden Unix-style directory; CHUB_HOME overrides both.
 */
export function dataHome(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.CHUB_HOME) return resolve(env.CHUB_HOME);
  if (platform === "win32" && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, "chub");
  return join(homeDirectory(env, platform), ".local", "share", "chub");
}

function homeDirectory(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  const configured = platform === "win32" ? (env.USERPROFILE ?? env.HOME) : env.HOME;
  return configured ?? homedir();
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

/** The file an extraction leaves naming the process that serves it, so pruning can tell a live instance from waste. */
const pidMarker = "pid";

/**
 * The embedded web build. Only the server path needs it, so data commands must not pay for it.
 */
export async function extractWeb(home: string): Promise<string> {
  const { web } = runtimePaths(home);
  await extract(webTarPath, web, "index.html");
  await claimRuntime(home);
  await pruneRuntime(home);
  return web;
}

/** Mark this build as in use, so another instance never deletes assets a running process is serving from. */
async function claimRuntime(home: string): Promise<void> {
  const root = join(home, "runtime", assetsHash);
  try {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, pidMarker), `${process.pid}\n`);
  } catch {
    // A marker that cannot be written costs disk, never correctness: the directory is then kept, not removed.
  }
}

/**
 * Drop the runtime extracted for a build nobody is running any more, so updating chub does not keep a copy per version.
 *
 * Only an extraction that names a process which is gone can be removed. A directory without a marker came from a build
 * that predates the marker and may still be serving a live instance, and deleting it would leave that instance unable
 * to serve its own web build — the failure this rule exists to prevent.
 */
export async function pruneRuntime(home: string, keep: string = assetsHash): Promise<void> {
  const root = join(home, "runtime");
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  const candidates: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== keep) candidates.push(entry.name);
  }
  const unused: string[] = [];
  for (const name of candidates) {
    if (await isUnused(root, name)) unused.push(name);
  }
  await Promise.all(unused.map((name) => rm(join(root, name), { recursive: true, force: true }).catch(() => undefined)));
}

async function isUnused(root: string, name: string): Promise<boolean> {
  let pid: number;
  try {
    pid = Number((await readFile(join(root, name, pidMarker), "utf8")).trim());
  } catch {
    return false;
  }
  return Number.isInteger(pid) && pid > 0 ? !isAlive(pid) : false;
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
