import { UsageError, countArgs, dateOption, parseOptions, withData, type Command } from "../command.js";
import { call, OpsError, resolveDay } from "../ops.js";
import { resolveNamed } from "../resolve.js";

type Item = {
  id: string; listId: string; text: string; done: boolean; dueDate: string | null;
  priority: string; recurrence: string; goalId: string | null; position: number;
  createdAt: string; updatedAt: string;
};
type List = { id: string; name: string; position: number; items: Item[]; createdAt: string; updatedAt: string };

function json(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function localDay(timestamp: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const todo: Command = {
  name: "todo",
  lines: ["todo [--json]", "todo add <text> [--list <name>] [--due <day>] [--priority <p>]", "todo check <item> [--json]", "todo lists [--json]"],
  async run(argv) {
    const verb = argv[0] === "add" || argv[0] === "check" || argv[0] === "lists" ? argv[0] : "show";
    const { args, values, flags } = parseOptions(verb === "show" ? argv : argv.slice(1), verb === "add" ? ["list", "due", "priority"] : [], verb === "add" ? [] : ["json"]);
    countArgs(args, verb === "add" || verb === "check" ? 1 : 0, `todo${verb === "show" ? "" : ` ${verb}`}`);
    const due = dateOption(values.due);
    if (due !== undefined) {
      const parsed = new Date(`${due}T00:00:00Z`);
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== due) throw new UsageError(`expected a valid day, got ${due}`);
    }
    if (values.priority !== undefined && !["none", "low", "medium", "high", "now"].includes(values.priority)) {
      throw new UsageError("--priority needs none, low, medium, high or now");
    }
    const original = args[0] ?? "";
    const tag = verb === "add" ? /(?:^|\s)#([^\s#]+)\s*$/.exec(original) : null;
    const text = tag ? original.slice(0, tag.index).trim() : original.trim();
    if (verb === "add" && !text) throw new UsageError("todo add needs non-empty text");
    if (tag && values.list !== undefined && values.list.toLowerCase() !== tag[1]?.toLowerCase()) {
      throw new UsageError("--list and the trailing list tag must agree");
    }
    await withData(async (db) => {
      const { checklists } = await call(db, "/api/checklists") as { checklists: List[] };
      if (verb === "add") {
        const name = values.list ?? tag?.[1];
        let list: List;
        if (name === undefined) {
          // Picking one of several lists silently would put the item somewhere the user did not ask for.
          const [only, ...others] = checklists;
          if (only === undefined) throw new UsageError("no lists available; create a list first");
          if (others.length > 0) {
            throw new UsageError(`--list is required; known lists: ${checklists.map((row) => row.name).join(", ")}`);
          }
          list = only;
        } else {
          try { list = resolveNamed(checklists, name, (row) => row.name, "list"); }
          catch (error) {
            if (error instanceof OpsError && error.code === "not_found") throw new UsageError(`unknown list "${name}"; known lists: ${checklists.map((row) => row.name).join(", ") || "(none)"}`);
            throw error;
          }
        }
        let item = await call(db, `/api/checklists/${encodeURIComponent(list.id)}/items`, json("POST", { text })) as Item;
        if (due !== undefined || values.priority !== undefined) {
          item = await call(db, `/api/checklists/items/${encodeURIComponent(item.id)}`, json("PATCH", { dueDate: due, priority: values.priority })) as Item;
        }
        console.error(`Added ${item.text} to ${list.name}`);
        return;
      }
      if (verb === "check") {
        const item = resolveNamed(checklists.flatMap((list) => list.items.filter((row) => !row.done)), original, (row) => row.text, "item");
        const result = await call(db, `/api/checklists/items/${encodeURIComponent(item.id)}`, json("PATCH", { done: true })) as Item;
        if (flags.json) console.log(JSON.stringify(result, null, 2));
        else console.error(`Checked ${item.text}${item.recurrence !== "none" ? "; next occurrence scheduled" : ""}`);
        return;
      }
      if (verb === "lists") {
        if (flags.json) console.log(JSON.stringify({ checklists }, null, 2));
        else if (checklists.length) console.log(checklists.map((list) => `${list.name}  ${list.id}`).join("\n"));
        return;
      }
      const day = await resolveDay(db);
      const relevant = checklists.map((list) => ({ ...list, items: list.items.filter((item) => !item.done && (item.dueDate !== null ? item.dueDate <= day.date : localDay(item.createdAt, day.timezone) === day.date)) })).filter((list) => list.items.length > 0);
      if (flags.json) console.log(JSON.stringify({ checklists: relevant }, null, 2));
      else if (relevant.length) console.log(relevant.map((list) => `${list.name}\n${list.items.map((item) => `  ${item.text}  ${item.id}${item.dueDate ? `  ${item.dueDate}` : ""}`).join("\n")}`).join("\n"));
    });
  },
};
