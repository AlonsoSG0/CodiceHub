import type { ChubDatabase } from "../../server/src/db/client.js";
import { openData } from "./context.js";

/** A wrong invocation, as opposed to a domain failure: the caller exits 2 instead of 1. */
export class UsageError extends Error {}

export const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/** One product module of the CLI. `index.ts` composes the help from `lines` and dispatches by `name`. */
export type Command = {
  /** The word typed after `chub`. */
  name: string;
  /** The usage lines for the top-level help, without the leading `chub`. */
  lines: string[];
  run(argv: string[]): Promise<void>;
};

/** Run a data command against the data home. The connection is closed plain: a running server may own the file. */
export async function withData(run: (db: ChubDatabase) => Promise<void>): Promise<void> {
  const { db, close } = await openData({ shutdown: "plain" });
  try {
    await run(db);
  } finally {
    close();
  }
}

/**
 * Split `argv` into positionals, valued options (`--unit 3`) and switches (`--json`). Anything not listed is a
 * usage error, so a typo never silently does something else.
 */
export function parseOptions(args: string[], valued: string[], switches: string[]) {
  const values: Record<string, string> = {};
  const flags: Record<string, boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (switches.includes(key)) flags[key] = true;
      else if (valued.includes(key)) {
        const value = args[++i];
        if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} needs a value`);
        values[key] = value;
      } else throw new UsageError(`Unknown option: ${arg}`);
    } else positional.push(arg);
  }
  return { args: positional, values, flags };
}

export function countArgs(args: string[], count: number, command: string): void {
  if (args.length !== count) throw new UsageError(`${command} needs ${count} argument(s)`);
}

export function dateOption(value?: string): string | undefined {
  if (value !== undefined && !dayPattern.test(value)) throw new UsageError(`expected a YYYY-MM-DD day, got ${value}`);
  return value;
}

export function finite(value: string, name: string): number {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new UsageError(`${name} needs a finite number`);
  return Number(value);
}

export function section(value?: string): "habits" | "books" | undefined {
  if (value !== undefined && value !== "habits" && value !== "books") {
    throw new UsageError("--section needs habits or books");
  }
  return value;
}

/** Data on stdout, either as JSON or as the caller's text. Keeps the stdout/stderr contract in one place. */
export function print(value: unknown, json: boolean): void {
  console.log(json ? JSON.stringify(value, null, 2) : String(value));
}
