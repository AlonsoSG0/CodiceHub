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

test("pruning keeps the running build and drops the extractions before it", async () => {
  const active = "current-build";
  const home = await dataHome(["old-one", active, "old-two"]);

  await pruneRuntime(home, active);

  expect(await readdir(join(home, "runtime"))).toEqual([active]);
  expect(await Bun.file(join(home, "runtime", active, "web", "index.html")).text()).toBe(`<html>${active}</html>`);
});

test("pruning a home that was never extracted is a no-op", async () => {
  const home = await mkdtemp(join(tmpdir(), "chub-runtime-"));
  cleanups.push(() => rm(home, { recursive: true, force: true }));

  await pruneRuntime(home, "current-build");

  expect(await readdir(home)).toEqual([]);
});
