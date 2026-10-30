import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { updateBinary } from "../src/update.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()?.(); });

async function fixture(name = "chub", checksumValid = true, payload?: string, echoedVersion = "2.0.0") {
  const dir = await mkdtemp(join(tmpdir(), "chub-update-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, name);
  const original = "original binary";
  await writeFile(path, original);
  const released = payload ?? `#!/bin/sh\necho ${echoedVersion}\n`;
  const compressed = gzipSync(released);
  const checksum = checksumValid ? new Bun.CryptoHasher("sha256").update(compressed).digest("hex") : "0".repeat(64);
  const requests: string[] = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const pathname = new URL(request.url).pathname;
    requests.push(pathname);
    if (pathname === "/releases/latest") return new Response(null, { status: 302, headers: { Location: "/releases/tag/v2.0.0" } });
    if (pathname === "/releases/latest/download/chub-linux-x64.gz") return new Response(compressed);
    if (pathname === "/releases/latest/download/SHA256SUMS") return new Response(`${checksum}  chub-linux-x64.gz\n`);
    if (pathname === "/releases/download/v2.0.0/chub-linux-x64.gz") return new Response(compressed);
    if (pathname === "/releases/download/v2.0.0/SHA256SUMS") return new Response(`${checksum}  chub-linux-x64.gz\n`);
    return new Response("Not found", { status: 404 });
  } });
  cleanups.push(() => server.stop(true));
  const options = { execPath: path, currentVersion: "1.0.0", baseUrl: `http://127.0.0.1:${server.port}`, platform: "linux" as const, arch: "x64", home: dir };
  return { dir, path, original, released, requests, options };
}

test("up to date leaves the binary unchanged without requesting the asset", async () => {
  const f = await fixture();
  expect(await updateBinary({ ...f.options, currentVersion: "2.0.0" })).toEqual({ installed: false, version: "2.0.0", path: f.path });
  expect(await readFile(f.path, "utf8")).toBe(f.original);
  expect(f.requests).toEqual(["/releases/latest"]);
});

test("installs verified bytes and reports the staged binary version", async () => {
  const f = await fixture();
  expect(await updateBinary(f.options)).toEqual({ installed: true, version: "2.0.0", path: f.path });
  expect(await readFile(f.path, "utf8")).toBe(f.released);
  expect(f.requests).toContain("/releases/latest/download/chub-linux-x64.gz");
  expect(await readdir(f.dir)).toEqual(["chub"]);
});

test.each([
  ["nonzero exit", "#!/bin/sh\nexit 1\n", "exited"],
  ["unexecutable bytes", "not an executable", "could not run"],
  ["empty version", "#!/bin/sh\nexit 0\n", "empty version"],
  ["different version", "#!/bin/sh\necho 2.0.1\n", "does not match"],
])("rejects a staged binary with %s without changing the installation", async (_name, payload, message) => {
  const f = await fixture("chub", true, payload);
  await expect(updateBinary(f.options)).rejects.toThrow(message);
  expect(await readFile(f.path, "utf8")).toBe(f.original);
  expect(await readdir(f.dir)).toEqual(["chub"]);
});

test("removes a stale staging file before installing", async () => {
  const f = await fixture();
  await writeFile(join(f.dir, `.chub.${process.pid}`), "leftover");
  expect(await updateBinary(f.options)).toEqual({ installed: true, version: "2.0.0", path: f.path });
  expect(await readFile(f.path, "utf8")).toBe(f.released);
  expect(await readdir(f.dir)).toEqual(["chub"]);
});

test("checksum mismatch leaves the binary unchanged", async () => {
  const f = await fixture("chub", false);
  await expect(updateBinary(f.options)).rejects.toThrow("checksum mismatch");
  expect(await readFile(f.path, "utf8")).toBe(f.original);
  expect(await readdir(f.dir)).toEqual(["chub"]);
});

test("refuses a non-chub executable without writing or requesting an asset", async () => {
  const f = await fixture("bun");
  await expect(updateBinary(f.options)).rejects.toThrow("chub or chub.exe");
  expect(await readFile(f.path, "utf8")).toBe(f.original);
  expect(await readdir(f.dir)).toEqual(["bun"]);
  expect(f.requests).toEqual([]);
});

test("a pinned release installs without asking which one is latest", async () => {
  const f = await fixture();

  const result = await updateBinary({ ...f.options, currentVersion: "9.9.9", pinnedVersion: "2.0.0" });

  expect(result).toEqual({ installed: true, version: "2.0.0", path: f.path });
  expect(f.requests).not.toContain("/releases/latest");
  expect(f.requests).toContain("/releases/download/v2.0.0/chub-linux-x64.gz");
});

test("on Windows a running server blocks the replacement", async () => {
  const f = await fixture();
  // The serving process is this test process: alive, and answering with its own pid.
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ pid: process.pid }) });
  cleanups.push(() => server.stop(true));
  await writeFile(
    join(f.dir, "server.json"),
    JSON.stringify({
      runId: "running",
      pid: process.pid,
      host: "127.0.0.1",
      port: server.port,
      url: `http://127.0.0.1:${server.port}`,
      version: "1.0.0",
      startedAt: new Date().toISOString(),
      logPath: join(f.dir, "server.log"),
    }),
  );

  await expect(updateBinary({ ...f.options, platform: "win32" })).rejects.toThrow("chub stop");
  expect(await readFile(f.path, "utf8")).toBe(f.original);
  expect(await readdir(f.dir)).toContain("chub");
});
