import { join } from "node:path";
import { countArgs, parseOptions, withData, type Command } from "../command.js";
import { dataHome } from "../context.js";
import { call } from "../ops.js";

type Backup = { name: string; bytes: number; createdAt: string };

export const backups: Command = {
  name: "backups",
  lines: ["backups [--json]"],
  async run(argv) {
    const { args, flags } = parseOptions(argv, [], ["json"]);
    countArgs(args, 0, "backups");
    await withData(async (db) => {
      const result = await call(db, "/api/backups") as { backups: Backup[] };
      if (flags.json) console.log(JSON.stringify(result, null, 2));
      else if (result.backups.length) console.log(result.backups.map(({ name, bytes, createdAt }) => `${name}  ${bytes} bytes  ${createdAt}`).join("\n"));
    });
  },
};

export const backup: Command = {
  name: "backup",
  lines: ["backup [--json]"],
  async run(argv) {
    const { args, flags } = parseOptions(argv, [], ["json"]);
    countArgs(args, 0, "backup");
    await withData(async (db) => {
      const result = await call(db, "/api/backups", { method: "POST" }) as { name: string };
      console.log(flags.json ? JSON.stringify(result, null, 2) : join(dataHome(), "backups", result.name));
    });
  },
};
