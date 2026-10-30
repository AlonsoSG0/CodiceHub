import pkg from "../../../package.json" with { type: "json" };
import { countArgs, parseOptions, print, type Command } from "../command.js";
import { UpdateError, updateBinary } from "../update.js";

export const update: Command = {
  name: "update",
  lines: ["update [--version <v>] [--json]", "  Downloads the latest release, verifies its checksum and replaces this binary"],
  async run(argv) {
    const { args, values, flags } = parseOptions(argv, ["version"], ["json"]);
    countArgs(args, 0, "update");
    try {
      const result = await updateBinary({ execPath: process.execPath, currentVersion: pkg.version, pinnedVersion: values.version });
      if (flags.json) print(result.installed ? { ...result, restartRequired: true } : result, true);
      else if (result.installed) print(`chub ${result.version} installed at ${result.path}\nRun chub restart to apply the new version`, false);
      else print(`chub ${result.version} is the latest version`, false);
    } catch (error) {
      if (error instanceof UpdateError) throw new Error(error.message);
      throw error;
    }
  },
};
