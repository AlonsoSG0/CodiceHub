import { mkdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { app } from "../../server/src/app.js";
import pkg from "../../package.json" with { type: "json" };
import { UsageError, type Command } from "./command.js";
import { backup, backups } from "./commands/backup.js";
import { exportCommand } from "./commands/export.js";
import { habits } from "./commands/habits.js";
import { note, notes } from "./commands/notes.js";
import { pref, prefs } from "./commands/prefs.js";
import { day, routine, week } from "./commands/routine.js";
import { search } from "./commands/search.js";
import { todo } from "./commands/todo.js";
import { dataHome, extractWeb, openData } from "./context.js";
import { OpsError } from "./ops.js";

/** One entry per product module. Adding a module is one import and one entry. */
const commands: Command[] = [search, notes, note, todo, habits, day, week, routine, prefs, pref, backup, backups, exportCommand];

function usage(): string {
  const lines = ["Usage: chub [command] [options]", "", "Commands:"];
  for (const command of commands) for (const line of command.lines) lines.push(`  ${line}`);
  lines.push(
    "",
    "With no command, chub serves the workspace and opens the browser.",
    "",
    "Options:",
    "  --port <port>  Port to listen on (default: PORT or 3000)",
    "  --host <host>  Loopback host to listen on (default: HOST or 127.0.0.1)",
    "  --no-open      Do not open the browser",
    "  -v, --version  Show the version and exit",
    "  -h, --help     Show this help and exit",
    "",
    "Environment:",
    "  PORT       Server port",
    "  HOST       Loopback host",
    "  CHUB_HOME  Data directory (default: ~/.local/share/chub)",
  );
  return lines.join("\n");
}

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

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(pkg.version);
    return;
  }
  const name = args[0];
  if (name === undefined || name.startsWith("-")) {
    await serve(serverOptions(args));
    return;
  }
  const command = commands.find((entry) => entry.name === name);
  if (command === undefined) throw new UsageError(`Unknown command: ${name}`);
  await command.run(args.slice(1));
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
    process.exitCode = error.code === "invalid_value" ? 2 : 1;
    return;
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

main().catch(fail);
