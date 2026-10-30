import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const script = join(import.meta.dir, "../../install.sh");

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

/** A buffer copy typed for `Response`, so a fixture body is a valid `BodyInit`. */
function bytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

/** A gzipped stand-in for the real binary: it echoes a version, so installing it proves the executable bit. */
function fakeBinary(version: string): Uint8Array<ArrayBuffer> {
  return bytes(gzipSync(`#!/bin/sh\necho ${version}\n`));
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

/** A release host serving exactly the given paths; anything else is a 404. */
function serveRelease(files: Record<string, Uint8Array<ArrayBuffer>>): string {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const body = files[new URL(request.url).pathname];
      return body === undefined ? new Response("Not found", { status: 404 }) : new Response(body);
    },
  });
  cleanups.push(() => server.stop(true));
  return `http://127.0.0.1:${server.port}`;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "chub-install-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

/** A PATH entry whose `uname` reports the given platform, so detection is tested without the host's platform. */
async function fakePlatform(system: string, machine: string): Promise<string> {
  const shim = join(await temporaryDirectory(), "shim");
  await mkdir(shim, { recursive: true });
  await writeFile(
    join(shim, "uname"),
    `#!/bin/sh\ncase "$1" in\n  -s) echo ${system} ;;\n  -m) echo ${machine} ;;\n  *) echo ${system} ;;\nesac\n`,
  );
  await chmod(join(shim, "uname"), 0o755);
  return shim;
}

function pipe(value: ReadableStream | number | undefined): ReadableStream {
  if (!value || typeof value === "number") throw new Error("install.sh did not expose a piped stream");
  return value;
}

async function runScript(args: string[], env: Record<string, string> = {}) {
  const spawned = Bun.spawn(["sh", script, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(pipe(spawned.stdout)).text(),
    new Response(pipe(spawned.stderr)).text(),
  ]);
  return { exitCode: await spawned.exited, stdout, stderr };
}

test("--help prints the usage and exits 0 without touching the network", async () => {
  const result = await runScript(["--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: install.sh");
  expect(result.stdout).toContain("--version");
  expect(result.stdout).toContain("--dir");
  expect(result.stderr).toBe("");
});

test("installs the matching asset, verifies its checksum and warns when the directory is off PATH", async () => {
  const asset = fakeBinary("0.4.0");
  const base = serveRelease({
    "/releases/latest/download/chub-linux-x64.gz": asset,
    "/releases/latest/download/SHA256SUMS": bytes(new TextEncoder().encode(`${sha256(asset)}  chub-linux-x64.gz\n`)),
  });
  const target = await temporaryDirectory();
  const shim = await fakePlatform("Linux", "x86_64");

  const result = await runScript(["--dir", target], {
    CHUB_INSTALL_BASE_URL: base,
    PATH: `${shim}:${process.env.PATH}`,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("0.4.0");
  expect(result.stderr).toContain("PATH");
  const installed = join(target, "chub");
  expect((await stat(installed)).mode & 0o111).not.toBe(0);
  expect(await new Response(Bun.spawn([installed, "--version"], { stdout: "pipe" }).stdout).text()).toBe("0.4.0\n");
});

test("--version installs that release instead of the latest one", async () => {
  const asset = fakeBinary("0.3.9");
  const base = serveRelease({
    "/releases/download/v0.3.9/chub-darwin-arm64.gz": asset,
    "/releases/download/v0.3.9/SHA256SUMS": bytes(new TextEncoder().encode(`${sha256(asset)}  chub-darwin-arm64.gz\n`)),
  });
  const target = await temporaryDirectory();
  const shim = await fakePlatform("Darwin", "arm64");

  const result = await runScript(["--version", "0.3.9", "--dir", target], {
    CHUB_INSTALL_BASE_URL: base,
    PATH: `${shim}:${process.env.PATH}`,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("0.3.9");
  expect(await readdir(target)).toEqual(["chub"]);
});

test("refuses a checksum mismatch and installs nothing", async () => {
  const asset = fakeBinary("0.4.0");
  const base = serveRelease({
    "/releases/latest/download/chub-linux-x64.gz": asset,
    "/releases/latest/download/SHA256SUMS": bytes(new TextEncoder().encode(`${"0".repeat(64)}  chub-linux-x64.gz\n`)),
  });
  const target = await temporaryDirectory();
  const shim = await fakePlatform("Linux", "x86_64");

  const result = await runScript(["--dir", target], {
    CHUB_INSTALL_BASE_URL: base,
    PATH: `${shim}:${process.env.PATH}`,
  });

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("checksum");
  expect(await readdir(target)).toEqual([]);
});

test("a rejected update leaves the existing installation untouched", async () => {
  const asset = fakeBinary("0.4.0");
  const base = serveRelease({
    "/releases/latest/download/chub-linux-x64.gz": asset,
    "/releases/latest/download/SHA256SUMS": bytes(new TextEncoder().encode(`${"0".repeat(64)}  chub-linux-x64.gz\n`)),
  });
  const target = await temporaryDirectory();
  const shim = await fakePlatform("Linux", "x86_64");
  const existing = "the chub that was already here";
  await writeFile(join(target, "chub"), existing);

  const result = await runScript(["--dir", target], {
    CHUB_INSTALL_BASE_URL: base,
    PATH: `${shim}:${process.env.PATH}`,
  });

  expect(result.exitCode).not.toBe(0);
  expect(await readFile(join(target, "chub"), "utf8")).toBe(existing);
  expect(await readdir(target)).toEqual(["chub"]);
});

test("fails with a readable message on an unsupported platform", async () => {
  const target = await temporaryDirectory();
  const shim = await fakePlatform("SunOS", "sparc");

  const result = await runScript(["--dir", target], { PATH: `${shim}:${process.env.PATH}` });

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("SunOS");
  expect(await readdir(target)).toEqual([]);
});
