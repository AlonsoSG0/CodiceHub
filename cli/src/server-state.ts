import { openSync, readlinkSync, renameSync, statSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataHome } from "./context.js";
import { isAlive } from "./process.js";

/** Re-exported so callers keep one import for what they read and signal about the running server. */
export { isAlive };

/**
 * What a serving `chub` records about itself so a second invocation can find it, describe it and stop it.
 *
 * `runId` is minted by whoever starts the process and handed down in `CHUB_RUN_ID`, which is what lets a detached
 * `chub start` tell its own child's file apart from the one a previous instance left behind.
 */
export type ServerState = {
  runId: string;
  pid: number;
  host: string;
  port: number;
  url: string;
  version: string;
  /** ISO timestamp of the moment the server began listening. */
  startedAt: string;
  logPath: string;
};

/** The URL a host and port answer on, bracketing an IPv6 loopback. */
export function serverUrl(host: string, port: number): string {
  return host.includes(":") ? `http://[${host}]:${port}` : `http://${host}:${port}`;
}

export function statePath(home: string = dataHome()): string {
  return join(home, "server.json");
}

export function serverLogPath(home: string = dataHome()): string {
  return join(home, "logs", "server.log");
}

function isState(value: unknown): value is ServerState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.runId === "string" &&
    typeof state.pid === "number" &&
    typeof state.host === "string" &&
    typeof state.port === "number" &&
    typeof state.url === "string" &&
    typeof state.version === "string" &&
    typeof state.startedAt === "string" &&
    typeof state.logPath === "string"
  );
}

/** The recorded state, or nothing when there is none or it cannot be believed. A bad file is never an error. */
export async function readState(home: string = dataHome()): Promise<ServerState | undefined> {
  let text: string;
  try {
    text = await readFile(statePath(home), "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isState(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Record a listening server. Mode 0600: the file names a process to signal, so it is not world-writable. */
export async function writeState(state: ServerState, home: string = dataHome()): Promise<void> {
  await mkdir(home, { recursive: true });
  await writeFile(statePath(home), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await chmod(statePath(home), 0o600);
}

/**
 * Remove the recorded state. With a `runId`, only when that is the recorded instance: a second server that failed to
 * bind must never delete the state of the one that is running.
 */
export async function clearState(home: string = dataHome(), runId?: string): Promise<void> {
  if (runId !== undefined) {
    const state = await readState(home);
    if (state !== undefined && state.runId !== runId) return;
  }
  await rm(statePath(home), { force: true });
}

/**
 * The pid serving that URL, when it answers. This is the identity check: a state file whose pid differs from the
 * one answering is stale, so nothing is signalled on its word alone.
 */
export async function probeServer(url: string, timeoutMs = 1500): Promise<number | undefined> {
  try {
    const response = await fetch(`${url}/api/server`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { pid?: unknown };
    return typeof payload.pid === "number" ? payload.pid : undefined;
  } catch {
    return undefined;
  }
}

function executableName(pid: number): string | undefined {
  if (process.platform === "linux") {
    try {
      return readlinkSync(`/proc/${pid}/exe`).replace(/ \(deleted\)$/, "");
    } catch {
      return undefined;
    }
  }
  const command = process.platform === "darwin"
    ? ["ps", "-p", String(pid), "-o", "comm="]
    : ["tasklist", "/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"];
  try {
    const run = Bun.spawnSync(command, { stdout: "pipe", stderr: "ignore" });
    if (run.exitCode !== 0) return undefined;
    return run.stdout.toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether that pid is a chub executable. Used only when the server does not answer: a wedged instance still holds
 * the port and the database, so `stop` may signal it, but never a recycled pid that belongs to something else.
 */
export function isChubProcess(pid: number): boolean {
  const name = executableName(pid);
  return name !== undefined && /(^|[/\\])chub(\.exe)?$/i.test(name);
}

/**
 * Close the previous run's log and start a new one, so growth is bounded by a single run instead of the machine's
 * uptime. Returns the path the new process should write to.
 */
export async function rotateLog(home: string = dataHome()): Promise<string> {
  const path = serverLogPath(home);
  await mkdir(join(home, "logs"), { recursive: true });
  try {
    renameSync(path, `${path}.1`);
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  return path;
}

/**
 * Open the log for appending. The serving process inherits this descriptor, so the caller closes its own copy right
 * after spawning: the child keeps its duplicate, and no handle is leaked into the parent.
 */
export function openLog(path: string): number {
  return openSync(path, "a");
}

/** The database file's size in bytes, reported by `status`. Missing or unreadable is nothing to show, not a failure. */
export function databaseBytes(path: string): number | undefined {
  try {
    return statSync(path).size;
  } catch {
    return undefined;
  }
}
