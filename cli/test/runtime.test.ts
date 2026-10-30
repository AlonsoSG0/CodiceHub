import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneRuntime } from "../src/context.js";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

/** A data home whose runtime holds one extracted web build per hash, plus a stray file. */
async function dataHome(hashes: string[]): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "chub-runtime-"));
  cleanups.push(() => rm(home, { recursive: true, force: true }));
  const runtime = join(home, "runtime");
  await mkdir(runtime, { recursive: true });
  for (const hash of hashes) {
    await mkdir(join(runtime, hash, "web"), { recursive: true });
    await writeFile(join(runtime, hash, "web", "index.html"), `<html>${hash}</html>`);
  }
  return home;
}

/** Record which process serves an extraction, the way `extractWeb` does before pruning. */
async function markPid(home: string, hash: string, pid: number): Promise<void> {
  await writeFile(join(home, "runtime", hash, "pid"), `${pid}\n`);
}

/** A pid that is certainly gone: a process that has already exited and been reaped. */
async function deadPid(): Promise<number> {
  const child = Bun.spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore" });
  child.kill("SIGKILL");
  await child.exited;
  return child.pid;
}

test("pruning drops the extractions whose process is gone and keeps the running build", async () => {
  const active = "current-build";
  const home = await dataHome(["old-one", active, "old-two"]);
  const gone = await deadPid();
  await markPid(home, "old-one", gone);
  await markPid(home, "old-two", gone);

  await pruneRuntime(home, active);

  expect(await readdir(join(home, "runtime"))).toEqual([active]);
  expect(await Bun.file(join(home, "runtime", active, "web", "index.html")).text()).toBe(`<html>${active}</html>`);
});

test("an extraction a live process is serving from is never pruned", async () => {
  const active = "current-build";
  const home = await dataHome([active, "still-serving"]);
  await markPid(home, "still-serving", process.pid);

  await pruneRuntime(home, active);

  // Deleting this one would leave the running instance unable to serve its own web build.
  expect((await readdir(join(home, "runtime"))).sort()).toEqual([active, "still-serving"].sort());
});

test("an extraction from a build that predates the marker is kept", async () => {
  const active = "current-build";
  const home = await dataHome([active, "older-build"]);
  await markPid(home, active, process.pid);

  await pruneRuntime(home, active);

  // Nothing proves the unmarked extraction is unused, so it stays: disk is cheaper than a broken server.
  expect((await readdir(join(home, "runtime"))).sort()).toEqual([active, "older-build"].sort());
});

test("pruning a home that was never extracted is a no-op", async () => {
  const home = await mkdtemp(join(tmpdir(), "chub-runtime-"));
  cleanups.push(() => rm(home, { recursive: true, force: true }));

  await pruneRuntime(home, "current-build");

  expect(await readdir(home)).toEqual([]);
});
