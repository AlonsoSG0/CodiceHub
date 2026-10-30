import { countArgs, parseOptions, withData, type Command } from "../command.js";
import { call } from "../ops.js";

export const search: Command = {
  name: "search",
  lines: ["search <text> [--json]"],
  async run(argv) {
    const { args, flags } = parseOptions(argv, [], ["json"]);
    countArgs(args, 1, "search");
    await withData(async (db) => {
      const result = (await call(db, `/api/search?q=${encodeURIComponent(args[0] ?? "")}`)) as {
        results: Array<{ id: string; title: string; snippet: string }>;
      };
      if (flags.json) console.log(JSON.stringify(result, null, 2));
      else if (result.results.length) {
        console.log(result.results.map(({ title, id, snippet }) => `${title}  ${id}${snippet ? `  ${snippet}` : ""}`).join("\n"));
      }
    });
  },
};
