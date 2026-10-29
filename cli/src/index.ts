import { mkdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { ChubDatabase } from "../../server/src/db/client.js";
import { app } from "../../server/src/app.js";
import pkg from "../../package.json" with { type: "json" };
import { dataHome, extractWeb, openData } from "./context.js";
import {
  OpsError,
  doneHabit,
  listHabits,
  type HabitDoneResult,
  type HabitFieldView,
  type HabitListResult,
  type HabitView,
} from "./ops.js";

const usage = `Usage: chub [command] [options]

Commands:
  habits list [--archived] [--json]
      Show today's habits with the values logged for today.
  habits done <name> [--date <day>] [--json]
      Mark every check field of one habit as done for the day.

With no command, chub serves the workspace and opens the browser.

Options:
  --port <port>  Port to listen on (default: PORT or 3000)
  --host <host>  Loopback host to listen on (default: HOST or 127.0.0.1)
  --no-open      Do not open the browser
  -v, --version  Show the version and exit
  -h, --help     Show this help and exit

Environment:
  PORT       Server port
  HOST       Loopback host
  CHUB_HOME  Data directory (default: ~/.local/share/chub)`;

const habitsUsage = `Usage: chub habits <command>

Commands:
  list [--archived] [--json]               Show today's habits
  done <name> [--date <day>] [--json]      Mark a habit's check fields as done

Options:
  --archived     Include archived habits
  --json         Print machine-readable JSON on stdout
  -h, --help     Show this help and exit`;

/** A wrong invocation, as opposed to a domain failure: the caller exits 2 instead of 1. */
class UsageError extends Error {}

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

function serverOptions(args: string[]) {
  const result = {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "127.0.0.1",
    open: true,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--no-open") result.open = false;
    else if (arg === "--port") {
      const value = args[++i];
      if (value === undefined) throw new UsageError("--port needs a port");
      result.port = Number(value);
    } else if (arg === "--host") {
      const value = args[++i];
      if (value === undefined) throw new UsageError("--host needs a host");
      result.host = value;
    } else throw new UsageError(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(result.port) || result.port < 0 || result.port > 65535) throw new UsageError("Invalid port");
  if (!["127.0.0.1", "localhost", "::1"].includes(result.host)) {
    throw new UsageError("Host must be a loopback address");
  }
  return result;
}

async function serve(config: { port: number; host: string; open: boolean }): Promise<void> {
  const home = dataHome();
  await mkdir(join(home, "uploads"), { recursive: true });
  const web = await extractWeb(home);
  const { db, close } = await openData();
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch(request) {
      let path: string;
      try {
        path = new URL(request.url).pathname;
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      if (path === "/api" || path.startsWith("/api/") || path === "/uploads" || path.startsWith("/uploads/")) {
        return app.fetch(request, { db });
      }
      const requested = path === "/" ? "index.html" : path.slice(1);
      const filePath = resolve(web, requested);
      if (filePath !== web && !filePath.startsWith(`${web}${sep}`)) return new Response("Not found", { status: 404 });
      return (async () => {
        try {
          if ((await stat(filePath)).isFile()) return new Response(Bun.file(filePath));
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
            return new Response("Internal server error", { status: 500 });
          }
        }
        return new Response(Bun.file(join(web, "index.html")));
      })();
    },
  });

  console.log(`chub listening at http://${config.host}:${server.port}`);
  if (config.open) {
    Bun.spawn(["xdg-open", `http://${config.host}:${server.port}`], { stdout: "ignore", stderr: "ignore" });
  }
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await server.stop(true);
    close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

/** Run a data command against the data home. The connection is closed plain: a running server may own the file. */
async function withData(run: (db: ChubDatabase) => Promise<void>): Promise<void> {
  const { db, close } = await openData({ shutdown: "plain" });
  try {
    await run(db);
  } finally {
    close();
  }
}

function renderField(field: HabitFieldView): string | undefined {
  if (field.kind === "check") return field.value === true ? "✓" : "·";
  if (field.value === null) return undefined;
  return `${field.label} ${field.value}${field.unit === null ? "" : ` ${field.unit}`}`;
}

function renderHabit(habit: HabitView): string {
  const parts = habit.fields.map(renderField).filter((part): part is string => part !== undefined);
  return parts.length === 0 ? "—" : parts.join("   ");
}

function renderHabitList(result: HabitListResult): string {
  const names = result.habits.map((habit) => (habit.archived ? `${habit.name} (archived)` : habit.name));
  const width = Math.max(0, ...names.map((name) => name.length));
  return result.habits
    .map((habit, index) => `${(names[index] ?? habit.name).padEnd(width)}   ${renderHabit(habit)}`.trimEnd())
    .join("\n");
}

function renderHabitDone(result: HabitDoneResult): string {
  const entries = result.entries.map((entry) => `${entry.label} = ${entry.value}`).join(", ");
  return `${result.habit.name}: ${entries} (${result.date})`;
}

function parseListOptions(args: string[]): { archived: boolean; json: boolean } {
  const result = { archived: false, json: false };
  for (const arg of args) {
    if (arg === "--archived") result.archived = true;
    else if (arg === "--json") result.json = true;
    else throw new UsageError(`Unknown option: ${arg}`);
  }
  return result;
}

function parseDoneOptions(args: string[]): { name: string; date?: string; json: boolean } {
  const result: { name?: string; date?: string; json: boolean } = { json: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--json") result.json = true;
    else if (arg === "--date") {
      const value = args[++i];
      if (value === undefined) throw new UsageError("--date needs a day");
      if (!dayPattern.test(value)) throw new UsageError(`--date needs a YYYY-MM-DD day, got ${value}`);
      result.date = value;
    } else if (arg.startsWith("-")) throw new UsageError(`Unknown option: ${arg}`);
    else if (result.name === undefined) result.name = arg;
    else throw new UsageError(`Unexpected argument: ${arg}`);
  }
  if (result.name === undefined) throw new UsageError("habits done needs a habit name");
  return { name: result.name, date: result.date, json: result.json };
}

async function habitsCommand(argv: string[]): Promise<void> {
  const verb = argv[0];
  if (verb === undefined) {
    console.log(habitsUsage);
    return;
  }
  if (verb === "list") {
    const options = parseListOptions(argv.slice(1));
    await withData(async (db) => {
      const result = await listHabits(db, { archived: options.archived });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        const rendered = renderHabitList(result);
        if (rendered !== "") console.log(rendered);
      }
    });
    return;
  }
  if (verb === "done") {
    const options = parseDoneOptions(argv.slice(1));
    await withData(async (db) => {
      const result = await doneHabit(db, options.name, { date: options.date });
      console.log(options.json ? JSON.stringify(result, null, 2) : renderHabitDone(result));
    });
    return;
  }
  throw new UsageError(`Unknown habits command: ${verb}`);
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(pkg.version);
    return;
  }
  const command = args[0];
  if (command === undefined || command.startsWith("-")) {
    await serve(serverOptions(args));
    return;
  }
  if (command === "habits") {
    await habitsCommand(args.slice(1));
    return;
  }
  throw new UsageError(`Unknown command: ${command}`);
}

function fail(error: unknown): void {
  if (error instanceof UsageError) {
    console.error(`chub: ${error.message}`);
    console.error("Run `chub --help` for the available commands.");
    process.exitCode = 2;
    return;
  }
  if (error instanceof OpsError) {
    console.error(`chub: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

main().catch(fail);
