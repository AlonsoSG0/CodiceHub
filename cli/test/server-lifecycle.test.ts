import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, isolate, isolatedHome, run, start } from "./helpers.js";

type StatusView = {
  running: boolean;
  url: string | null;
  pid: number | null;
  version: string | null;
  startedAt: string | null;
  uptimeSeconds: number | null;
  dataHome: string;
  logPath: string;
};

afterEach(async () => {
  // A detached server outlives this test process, so it is stopped before its data home disappears.
  await run(["stop"]).catch(() => undefined);
  await cleanup();
});

/** `chub status --json`, parsed, with the raw result kept for exit-code assertions. */
async function status() {
  const result = await run(["status", "--json"]);
  return { ...result, view: JSON.parse(result.stdout) as StatusView };
}

/** A PATH entry whose `xdg-open` records that it ran, so "does not open the browser" is observable. */
async function openerShim(marker: string): Promise<string> {
  const shim = join(isolatedHome(), "shim");
  await mkdir(shim, { recursive: true });
  await writeFile(join(shim, "xdg-open"), `#!/bin/sh\ntouch '${marker}'\n`);
  await chmod(join(shim, "xdg-open"), 0o755);
  return shim;
}

test("start returns while the server keeps serving, without opening a browser", async () => {
  await isolate();
  const marker = join(isolatedHome(), "opened");
  const shim = await openerShim(marker);

  const started = await run(["start", "--port", "0"], { PATH: `${shim}:${process.env.PATH ?? ""}` });

  // The call returned, which is the whole point: a foreground server would have held this process open.
  expect(started.exitCode).toBe(0);
  const url = started.stdout.trim();
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect((await fetch(`${url}/api/health`)).status).toBe(200);
  expect(await Bun.file(marker).exists()).toBe(false);

  const reported = await status();
  expect(reported.exitCode).toBe(0);
  expect(reported.view).toMatchObject({ running: true, url });
  expect(await Bun.file(join(isolatedHome(), "logs", "server.log")).text()).toContain("chub listening at");

  // Starting again reports the instance that is already there instead of spawning a second one.
  const again = await run(["start", "--port", "0"]);
  expect(again.exitCode).toBe(0);
  expect(again.stdout.trim()).toBe(`chub is already running at ${url}`);
  expect((await status()).view.pid).toBe(reported.view.pid);
}, 30_000);

test("status and stop also reach a server started in the foreground", async () => {
  await isolate();
  const address = await start();

  const reported = await status();
  expect(reported.view).toMatchObject({ running: true, url: address });

  const stopped = await run(["stop", "--json"]);
  expect(stopped.exitCode).toBe(0);
  expect(JSON.parse(stopped.stdout)).toEqual({ stopped: true, pid: expect.any(Number), url: address });

  // The foreground process is gone, not merely forgotten.
  expect(fetch(`${address}/api/health`)).rejects.toThrow();
  const after = await status();
  expect(after.exitCode).toBe(3);
  expect(after.stderr).toBe("");
  expect(after.view).toEqual({
    running: false,
    url: null,
    pid: null,
    version: null,
    startedAt: null,
    uptimeSeconds: null,
    dataHome: isolatedHome(),
    logPath: join(isolatedHome(), "logs", "server.log"),
  });
}, 30_000);

test("stopping when nothing runs is a no-op that succeeds", async () => {
  await isolate();

  const stopped = await run(["stop", "--json"]);

  expect(stopped.exitCode).toBe(0);
  expect(JSON.parse(stopped.stdout)).toEqual({ stopped: false });
  expect(stopped.stderr).toBe("");
}, 30_000);

test("a stale state file never gets an unrelated process signalled", async () => {
  await isolate();
  const sleeper = Bun.spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore" });
  try {
    await writeFile(
      join(isolatedHome(), "server.json"),
      JSON.stringify({
        runId: "stale",
        pid: sleeper.pid,
        host: "127.0.0.1",
        port: 1,
        url: "http://127.0.0.1:1",
        version: "0.0.0",
        startedAt: new Date().toISOString(),
        logPath: join(isolatedHome(), "logs", "server.log"),
      }),
    );

    const stopped = await run(["stop", "--json"]);

    expect(stopped.exitCode).toBe(0);
    expect(JSON.parse(stopped.stdout)).toEqual({ stopped: false });
    expect(sleeper.exitCode).toBeNull();
    expect(await Bun.file(join(isolatedHome(), "server.json")).exists()).toBe(false);
  } finally {
    sleeper.kill();
    await sleeper.exited;
  }
}, 30_000);

test("restart keeps the running port and replaces the process", async () => {
  await isolate();
  const started = await run(["start", "--port", "0"]);
  expect(started.exitCode).toBe(0);
  const url = started.stdout.trim();
  const before = (await status()).view;

  const restarted = await run(["restart", "--json"]);
  expect(restarted.exitCode).toBe(0);
  const after = JSON.parse(restarted.stdout) as StatusView;

  expect(after.url).toBe(url);
  expect(after.pid).not.toBe(before.pid);
  expect((await fetch(`${url}/api/health`)).status).toBe(200);
}, 30_000);

test("a port already in use fails with the log to read and no URL on stdout", async () => {
  await isolate();
  // Held by something that is not chub: the child cannot bind, and the parent must not pretend it did.
  const busy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("busy") });
  try {
    const failed = await run(["start", "--port", String(busy.port)]);

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe("");
    expect(failed.stderr).toContain("before listening");
    expect(failed.stderr).toContain(join("logs", "server.log"));
    expect((await Bun.file(join(isolatedHome(), "logs", "server.log")).text()).length).toBeGreaterThan(0);
  } finally {
    busy.stop(true);
  }
}, 30_000);

test("a timed-out start leaves no child holding its port", async () => {
  await isolate();
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reservation.port;
  reservation.stop(true);

  const failed = await run(["start", "--port", String(port)], { CHUB_START_TIMEOUT_MS: "1" });
  expect(failed.exitCode).toBe(1);
  expect(failed.stdout).toBe("");
  expect(failed.stderr).toContain(join(isolatedHome(), "logs", "server.log"));

  // A surviving child would either be reported as already running or prevent the new child from binding this port.
  const again = await run(["start", "--port", String(port)]);
  expect(again.exitCode).toBe(0);
  expect(again.stdout.trim()).toBe(`http://127.0.0.1:${port}`);
  expect(again.stderr).toBe("");
}, 30_000);

test("each start rotates the log, so one file covers one run", async () => {
  await isolate();
  expect((await run(["start", "--port", "0"])).exitCode).toBe(0);
  expect((await run(["stop"])).exitCode).toBe(0);
  expect((await run(["start", "--port", "0"])).exitCode).toBe(0);

  const logs = join(isolatedHome(), "logs");
  expect((await readdir(logs)).sort()).toEqual(["server.log", "server.log.1"]);
  expect(await Bun.file(join(logs, "server.log.1")).text()).toContain("chub listening at");
}, 30_000);
