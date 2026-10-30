import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const binary = join(import.meta.dir, "../dist/chub");

let child: ReturnType<typeof Bun.spawn> | undefined;
let home: string | undefined;

/** Create the isolated data home the current file's commands run against. Call it at the start of a test. */
export async function isolate(): Promise<string> {
  home = await mkdtemp(join(tmpdir(), "chub-test-"));
  return home;
}

/** The isolated data home. Throws when a test forgot `isolate()`, so nothing can reach the real one. */
export function isolatedHome(): string {
  if (home === undefined) throw new Error("call isolate() before using the data home");
  return home;
}

/** Spawn the compiled binary once and collect its streams. Inherits the isolated home unless `env` overrides it. */
export async function run(args: string[], env: Record<string, string> = {}) {
  const spawned = Bun.spawn([binary, ...args], {
    env: { ...process.env, ...(home === undefined ? {} : { CHUB_HOME: home }), ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([text(spawned.stdout), text(spawned.stderr)]);
  await spawned.exited;
  return { exitCode: spawned.exitCode, stdout, stderr };
}

/** Start the server on a free port and return its address. */
export async function start(): Promise<string> {
  child = Bun.spawn([binary, "--port", "0", "--no-open"], {
    env: { ...process.env, CHUB_HOME: isolatedHome() },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (!child.stdout || typeof child.stdout === "number") throw new Error("chub did not expose a piped stream");
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let address = "";
  while (!address) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`chub exited before listening: ${output}`);
    output += decoder.decode(value);
    address = output.match(/http:\/\/[^\s]+/)?.[0] ?? "";
  }
  return address;
}

export async function stop(): Promise<void> {
  child?.kill("SIGTERM");
  await child?.exited;
}

/** Stop the server, remove the isolated home and forget it. Use it in `afterEach`. */
export async function cleanup(): Promise<void> {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await child.exited;
  }
  if (home !== undefined) await rm(home, { recursive: true, force: true });
  child = undefined;
  home = undefined;
}

/** POST JSON to the running server, for seeding a test. */
export async function seed(address: string, path: string, body: unknown, method = "POST") {
  const response = await fetch(`${address}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`seed ${path} answered ${response.status}`);
  return (await response.json()) as unknown;
}

async function text(value: ReadableStream | number | undefined): Promise<string> {
  if (!value || typeof value === "number") throw new Error("chub did not expose a piped stream");
  return new Response(value).text();
}
