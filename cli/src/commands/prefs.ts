import { UsageError, countArgs, parseOptions, withData, type Command } from "../command.js";
import { call, OpsError } from "../ops.js";

const lines = [
  "prefs [--json]",
  "pref get <key> [--json]",
  "pref set <key> <value> [--json]",
  "  Preference keys include workspace.timezone and appearance.theme",
];

type Preferences = { preferences: Record<string, unknown> };

function display(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export const prefs: Command = {
  name: "prefs",
  lines,
  async run(argv) {
    const { args, flags } = parseOptions(argv, [], ["json"]);
    countArgs(args, 0, "prefs");
    await withData(async (db) => {
      const result = (await call(db, "/api/preferences")) as Preferences;
      if (flags.json) console.log(JSON.stringify(result, null, 2));
      else {
        const text = Object.entries(result.preferences).map(([key, value]) => `${key} = ${display(value)}`).join("\n");
        if (text) console.log(text);
      }
    });
  },
};

export const pref: Command = {
  name: "pref",
  lines: [],
  async run(argv) {
    const verb = argv[0];
    if (verb !== "get" && verb !== "set") throw new UsageError("pref needs get or set");
    const { args, flags } = parseOptions(argv.slice(1), [], ["json"]);
    countArgs(args, verb === "get" ? 1 : 2, `pref ${verb}`);
    const key = args[0] ?? "";
    await withData(async (db) => {
      let value: unknown;
      if (verb === "get") {
        const result = (await call(db, "/api/preferences")) as Preferences;
        if (!Object.hasOwn(result.preferences, key)) throw new OpsError("not_found", `no preference matches "${key}"`);
        value = result.preferences[key];
      } else {
        const input = args[1] ?? "";
        try { value = JSON.parse(input) as unknown; } catch { value = input; }
        await call(db, `/api/preferences/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value }),
        });
      }
      console.log(flags.json ? JSON.stringify({ key, value }, null, 2) : `${key} = ${display(value)}`);
    });
  },
};
