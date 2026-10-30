import { writeFile } from "node:fs/promises";
import { UsageError, countArgs, parseOptions, withData, type Command } from "../command.js";
import { call, callText } from "../ops.js";
import { resolveNamed } from "../resolve.js";

type Page = { id: string; title: string };

export const exportCommand: Command = {
  name: "export",
  lines: ["export <page> [--out <file>] [--json]"],
  async run(argv) {
    const { args, values, flags } = parseOptions(argv, ["out"], ["json"]);
    // Writing a file already answers the question; silently ignoring --json would lie about what happened.
    if (values.out !== undefined && flags.json) throw new UsageError("--out and --json cannot be combined");
    countArgs(args, 1, "export");
    await withData(async (db) => {
      const tree = (await call(db, "/api/pages/tree")) as { pages: Page[] };
      const page = resolveNamed(tree.pages, args[0] ?? "", (row) => row.title, "page");
      const markdown = await callText(db, `/api/pages/${encodeURIComponent(page.id)}/export.md`);
      if (values.out !== undefined) {
        await writeFile(values.out, markdown);
        console.error(values.out);
        return;
      }
      if (flags.json) {
        console.log(JSON.stringify({ page: { id: page.id, title: page.title }, format: "markdown", markdown }, null, 2));
        return;
      }
      process.stdout.write(markdown);
    });
  },
};
