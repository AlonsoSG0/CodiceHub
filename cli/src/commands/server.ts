import { closeSync } from "node:fs";
import { countArgs, parseOptions, print, serverOptions, type Command } from "../command.js";
import { dataHome } from "../context.js";
import {
  clearState,
  isAlive,
  isChubProcess,
  openLog,
  probeServer,
  readState,
  rotateLog,
  serverLogPath,
  type ServerState,
} from "../server-state.js";

/** How long a polite stop waits before it stops being polite, and how long the escalation waits. */
const GRACE_MS = 10_000;
const KILL_MS = 2_000;

/** How long `start` waits for its child to answer before it calls the attempt a failure. */
const START_TIMEOUT_MS = 15_000;

/**
 * The state of the instance that is actually serving: the recorded pid must be the one answering its own URL.
 * A file that no longer matches is stale, so it is removed instead of trusted.
 */
async function liveState(home: string): Promise<ServerState | undefined> {
  const state = await readState(home);
  if (state === undefined) return undefined;
  if ((await probeServer(state.url)) === state.pid) return state;
  // A live chub that did not answer keeps its record: a busy server is not a dead one, and `stop` can still reach it.
  if (isAlive(state.pid) && isChubProcess(state.pid)) return undefined;
  await clearState(home);
  return undefined;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * Launch a server that outlives this process: its own process group (so the terminal's `Ctrl+C` never reaches it), no
 * inherited terminal descriptors (its output is the log, not the prompt), and no reference left in this process (so the
 * caller's terminal is free the moment this returns). The URL is only reported once the child answers for itself.
 */
async function spawnServer(home: string, port: number, host: string): Promise<ServerState> {
  const runId = crypto.randomUUID();
  const logPath = await rotateLog(home);
  const log = openLog(logPath);
  const child = Bun.spawn([process.execPath, "--port", String(port), "--host", host, "--no-open"], {
    env: { ...process.env, CHUB_HOME: home, CHUB_RUN_ID: runId },
    stdin: "ignore",
    stdout: log,
    stderr: log,
    detached: true,
  });
  closeSync(log);
  child.unref();

  // Test hook for exercising the timeout without waiting for the normal deadline.
  const override = Number(process.env.CHUB_START_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(override) && override > 0 ? override : START_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const exitCode = child.exitCode;
    if (exitCode !== null) throw new Error(`chub exited with code ${exitCode} before listening; see ${logPath}`);
    const state = await readState(home);
    if (state !== undefined && state.runId === runId && (await probeServer(state.url)) === state.pid) return state;
    await Bun.sleep(50);
  }
  if (child.exitCode === null) {
    try {
      child.kill("SIGTERM");
    } catch {
      // The child may have exited between the check and the signal.
    }
    await Promise.race([child.exited, Bun.sleep(KILL_MS)]);
    if (child.exitCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        // The child may have exited while escalation was pending.
      }
    }
  }
  await child.exited;
  throw new Error(`chub did not answer within ${timeoutMs / 1000}s; see ${logPath}`);
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await Bun.sleep(50);
  }
  return !isAlive(pid);
}

async function terminate(pid: number): Promise<void> {
  process.kill(pid, "SIGTERM");
  if (await waitForExit(pid, GRACE_MS)) return;
  process.kill(pid, "SIGKILL");
  if (await waitForExit(pid, KILL_MS)) return;
  throw new Error(`chub (pid ${pid}) ignored SIGTERM and SIGKILL`);
}

/**
 * Stop the recorded instance and return what was stopped, or nothing when nothing was running.
 *
 * The pid is never signalled on the state file's word alone. A server that answers with the recorded pid is that
 * server; one that answers with another pid means the recorded process is gone, and signalling it would hit a stranger.
 */
async function stopServer(home: string): Promise<ServerState | undefined> {
  const state = await readState(home);
  if (state === undefined) return undefined;

  const answering = await probeServer(state.url);
  if (answering === state.pid) {
    await terminate(answering);
    await clearState(home);
    return state;
  }
  if (answering !== undefined) {
    await clearState(home);
    throw new Error(`chub recorded pid ${state.pid} for ${state.url}, but pid ${answering} answers there; left it alone`);
  }
  // Nothing answers, so the server is either wedged or gone. Confirm the process before signalling it: a recycled pid
  // may belong to anything.
  if (isAlive(state.pid) && isChubProcess(state.pid)) {
    await terminate(state.pid);
    await clearState(home);
    return state;
  }
  await clearState(home);
  return undefined;
}

type StatusView = {
  running: true;
  url: string;
  pid: number;
  version: string;
  startedAt: string;
  uptimeSeconds: number;
  dataHome: string;
  logPath: string;
};

function view(state: ServerState, home: string): StatusView {
  return {
    running: true,
    url: state.url,
    pid: state.pid,
    version: state.version,
    startedAt: state.startedAt,
    uptimeSeconds: Math.max(0, Math.round((Date.now() - Date.parse(state.startedAt)) / 1000)),
    dataHome: home,
    logPath: state.logPath,
  };
}

function reportRunning(state: ServerState, home: string, json: boolean): void {
  const status = view(state, home);
  if (json) {
    print(status, true);
    return;
  }
  console.log(
    [
      `chub is running at ${status.url}`,
      `  pid      ${status.pid}`,
      `  version  ${status.version}`,
      `  uptime   ${formatUptime(status.uptimeSeconds)}`,
      `  data     ${status.dataHome}`,
      `  log      ${status.logPath}`,
    ].join("\n"),
  );
}

export const status: Command = {
  name: "status",
  lines: ["status [--json]", "  Whether chub is running, where, and since when (exit 3 when it is not)"],
  async run(argv) {
    const { args, flags } = parseOptions(argv, [], ["json"]);
    countArgs(args, 0, "status");
    const home = dataHome();
    const state = await liveState(home);
    if (state === undefined) {
      if (flags.json) print({
        running: false,
        url: null,
        pid: null,
        version: null,
        startedAt: null,
        uptimeSeconds: null,
        dataHome: home,
        logPath: serverLogPath(home),
      }, true);
      else console.log("chub is not running");
      process.exitCode = 3;
      return;
    }
    reportRunning(state, home, flags.json === true);
  },
};

export const start: Command = {
  name: "start",
  lines: ["start [--port <port>] [--host <host>] [--json]", "  Serve in the background and print the URL; the terminal stays free"],
  async run(argv) {
    const options = serverOptions(argv, ["json"]);
    const home = dataHome();
    const running = await liveState(home);
    if (running !== undefined) {
      if (options.flags.json) reportRunning(running, home, true);
      else console.log(`chub is already running at ${running.url}`);
      return;
    }
    const state = await spawnServer(home, options.port, options.host);
    if (options.flags.json) reportRunning(state, home, true);
    else console.log(state.url);
  },
};

export const stop: Command = {
  name: "stop",
  lines: ["stop [--json]", "  Stop the running server, however it was started"],
  async run(argv) {
    const { args, flags } = parseOptions(argv, [], ["json"]);
    countArgs(args, 0, "stop");
    const stopped = await stopServer(dataHome());
    if (flags.json) {
      print(stopped === undefined ? { stopped: false } : { stopped: true, pid: stopped.pid, url: stopped.url }, true);
      return;
    }
    console.log(stopped === undefined ? "chub is not running" : `chub stopped (pid ${stopped.pid})`);
  },
};

export const restart: Command = {
  name: "restart",
  lines: ["restart [--port <port>] [--host <host>] [--json]", "  Stop, then serve in the background again"],
  async run(argv) {
    const options = serverOptions(argv, ["json"]);
    const home = dataHome();
    const previous = await stopServer(home);
    // A restart keeps what the instance was doing: the same host and the same port, unless the caller changes them.
    const port = options.given.port ?? previous?.port ?? options.port;
    const host = options.given.host ?? previous?.host ?? options.host;
    const state = await spawnServer(home, port, host);
    if (options.flags.json) reportRunning(state, home, true);
    else console.log(state.url);
  },
};
