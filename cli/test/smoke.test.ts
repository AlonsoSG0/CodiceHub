import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };

const binary = join(import.meta.dir, "../dist/chub");

let child: ReturnType<typeof Bun.spawn> | undefined;
let home: string | undefined;

afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await child.exited;
  }
  if (home) await rm(home, { recursive: true, force: true });
  child = undefined;
  home = undefined;
});

function pipe(value: ReadableStream | number | undefined): ReadableStream {
  if (!value || typeof value === "number") throw new Error("chub did not expose a piped stream");
  return value;
}

async function run(args: string[], env: Record<string, string> = {}) {
  const spawned = Bun.spawn([binary, ...args], {
    // Every command inherits the isolated data home, so a missing argument can never reach the real one.
    env: { ...process.env, ...(home === undefined ? {} : { CHUB_HOME: home }), ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([new Response(pipe(spawned.stdout)).text(), new Response(pipe(spawned.stderr)).text()]);
  await spawned.exited;
  return { exitCode: spawned.exitCode, stdout, stderr };
}

async function start(): Promise<string> {
  if (home === undefined) throw new Error("start() needs an isolated data home");
  child = Bun.spawn([binary, "--port", "0", "--no-open"], {
    env: { ...process.env, CHUB_HOME: home },
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = pipe(child.stdout).getReader();
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

async function stop(): Promise<void> {
  child?.kill("SIGTERM");
  await child?.exited;
}

test("--help prints usage and exits without starting the server", async () => {
  const result = await run(["--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("--port");
  expect(result.stdout).toContain("--host");
  expect(result.stdout).toContain("--no-open");
  expect(result.stdout).toContain("PORT");
  expect(result.stdout).toContain("HOST");
  expect(result.stdout).toContain("CHUB_HOME");
});

test("--version and -v print the version without touching the data home", async () => {
  home = await mkdtemp(join(tmpdir(), "chub-version-"));
  const unopened = join(home, "unopened");

  for (const flag of ["-v", "--version"]) {
    const result = await run([flag], { CHUB_HOME: unopened });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  }
  expect(await Bun.file(unopened).exists()).toBe(false);
});

test("an unknown command exits 2 with the message on stderr", async () => {
  const result = await run(["nope"]);
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("nope");
});

test("compiled chub serves the API and web from an isolated data home", async () => {
  try {
    await stat(binary);
  } catch {
    throw new Error(`Compiled chub binary is missing: ${binary}. Run bun run build:binary first.`);
  }
  home = await mkdtemp(join(tmpdir(), "chub-smoke-"));

  const address = await start();
  const health = await fetch(`${address}/api/health`);
  expect(health.status).toBe(200);
  for (const path of ["/", "/deep/link"]) {
    const response = await fetch(`${address}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  }
  const created = await fetch(`${address}/api/pages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "CLI smoke page" }),
  });
  expect(created.status).toBe(201);
  const tree = await fetch(`${address}/api/pages/tree`);
  expect(await tree.text()).toContain("CLI smoke page");
  expect((await stat(join(home, "chub.db"))).isFile()).toBe(true);

  await stop();
  expect(await Bun.file(join(home, "chub.db-wal")).exists()).toBe(false);

  const restarted = await start();
  expect((await fetch(`${restarted}/api/health`)).status).toBe(200);
  expect(await (await fetch(`${restarted}/api/pages/tree`)).text()).toContain("CLI smoke page");
  await stop();
});

test("extended habits commands operate on API-seeded data", async () => {
  home = await mkdtemp(join(tmpdir(), "chub-habits-extended-"));
  const address = await start();
  const create = async (name: string) => {
    const response = await fetch(`${address}/api/habits`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    expect(response.status).toBe(201);
    return await response.json() as { id: string };
  };
  const habit = await create("Reading");
  await create("Reading notes");
  const added = await fetch(`${address}/api/habits/${habit.id}/fields`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "number", label: "Minutes" }) });
  expect(added.status).toBe(201);
  await stop();
  const command = async (...args: string[]) => run(["habits", ...args]);
  const history = await command("log", "Reading", "--json");
  expect(history.exitCode).toBe(0);
  expect(JSON.parse(history.stdout).entries).toEqual([]);
  expect((await command("set", "Reading", "Minutes", "12")).exitCode).toBe(0);
  const invalid = await command("set", "Reading", "Minutes", "wrong");
  expect(invalid.exitCode).toBe(2);
  expect(invalid.stdout).toBe("");
  expect(JSON.parse((await command("log", "Reading", "--json")).stdout).entries[0].value).toBe(12);
  expect((await command("set", "Reading", "Minutes", "--clear")).exitCode).toBe(0);
  expect(JSON.parse((await command("log", "Reading", "--json")).stdout).entries).toEqual([]);
  expect((await command("done", "Reading")).exitCode).toBe(0);
  const undo = await command("undo", "Reading", "--json");
  expect(undo.exitCode).toBe(0);
  expect(JSON.parse(undo.stdout).entries[0].value).toBe(false);
  expect(JSON.parse((await command("log", "Reading", "--json")).stdout).entries).toEqual([]);
  expect((await command("rename", "Reading", "Books read")).exitCode).toBe(0);
  expect((await command("archive", "Books read")).exitCode).toBe(0);
  expect(JSON.parse((await command("list", "--json")).stdout).habits.map((h: { name: string }) => h.name)).not.toContain("Books read");
  expect(JSON.parse((await command("list", "--archived", "--json")).stdout).habits.map((h: { name: string }) => h.name)).toContain("Books read");
  expect((await command("unarchive", "Books read")).exitCode).toBe(0);
  expect((await command("field", "add", "Books read", "Pages", "--kind", "number")).exitCode).toBe(0);
  expect((await command("field", "update", "Books read", "Pages", "--label", "Pages read")).exitCode).toBe(0);
  expect((await command("done", "missing")).exitCode).toBe(1);
  expect((await command("add", "Reading extra")).exitCode).toBe(0);
  expect((await command("done", "Reading")).exitCode).toBe(1);
});

test("habits commands read and write the data home without a running server", async () => {
  home = await mkdtemp(join(tmpdir(), "chub-habits-"));

  const address = await start();
  const created = await fetch(`${address}/api/habits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Reading" }),
  });
  expect(created.status).toBe(201);
  const habit = (await created.json()) as { id: string };
  const field = await fetch(`${address}/api/habits/${habit.id}/fields`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "number", label: "Minutes" }),
  });
  expect(field.status).toBe(201);
  await stop();

  const listed = await run(["habits", "list", "--json"]);
  expect(listed.exitCode).toBe(0);
  const before = JSON.parse(listed.stdout) as {
    date: string;
    timezone: string;
    habits: Array<{ name: string; fields: Array<{ kind: string; value: unknown }> }>;
  };
  expect(before.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(before.timezone).toBe("America/Mexico_City");
  expect(before.habits.map((entry) => entry.name)).toEqual(["Reading"]);
  expect(before.habits[0]?.fields.find((entry) => entry.kind === "check")?.value).toBeNull();

  const done = await run(["habits", "done", "Read", "--json"]);
  expect(done.exitCode).toBe(0);
  const marked = JSON.parse(done.stdout) as {
    date: string;
    entries: Array<{ fieldId: string; kind: string; label: string; value: unknown }>;
  };
  expect(marked.date).toBe(before.date);
  expect(marked.entries).toEqual([{ fieldId: expect.any(String), kind: "check", label: "Done", value: true }]);

  const after = JSON.parse((await run(["habits", "list", "--json"])).stdout) as {
    habits: Array<{ fields: Array<{ kind: string; value: unknown }> }>;
  };
  expect(after.habits[0]?.fields.find((entry) => entry.kind === "check")?.value).toBe(true);
  expect(after.habits[0]?.fields.find((entry) => entry.kind === "number")?.value).toBeNull();

  const missing = await run(["habits", "done", "nope"]);
  expect(missing.exitCode).toBe(1);
  expect(missing.stdout).toBe("");
  expect(missing.stderr).toContain("nope");
});
