import {
  UsageError,
  countArgs,
  dateOption,
  finite,
  parseOptions,
  section,
  withData,
  type Command,
} from "../command.js";
import {
  addField,
  changeHabit,
  createHabit,
  doneHabit,
  listHabits,
  logHabit,
  setHabitValue,
  undoHabit,
  updateField,
  type HabitDoneResult,
  type HabitFieldKind,
  type HabitFieldView,
  type HabitListResult,
  type HabitView,
} from "../ops.js";

const lines = [
  "habits list [--archived] [--section <habits|books>] [--json]",
  "habits log <name> [--days <n>] [--from <day> --to <day>] [--json]",
  "habits done|undo <name> [--date <day>] [--json]",
  "habits set <name> <field> <value> [--date <day>] [--clear] [--json]",
  "habits add <name> [--icon <icon>] [--section <habits|books>] [--json]",
  "habits rename <name> <new-name> [--json]",
  "habits archive|unarchive <name> [--json]",
  "habits field add <habit> <label> --kind <check|number|text> [--unit <unit>] [--target <n>] [--json]",
  "habits field update <habit> <field> [--label <label>] [--unit <unit>] [--target <n>] [--json]",
];

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

function parseListOptions(args: string[]): { archived: boolean; json: boolean; section?: "habits" | "books" } {
  const parsed = parseOptions(args, ["section"], ["archived", "json"]);
  if (parsed.args.length) throw new UsageError(`Unexpected argument: ${parsed.args[0]}`);
  return { archived: !!parsed.flags.archived, json: !!parsed.flags.json, section: section(parsed.values.section) };
}

function parseDoneOptions(args: string[]): { name: string; date?: string; json: boolean } {
  const parsed = parseOptions(args, ["date"], ["json"]);
  countArgs(parsed.args, 1, "habits done or undo");
  return { name: parsed.args[0] ?? "", date: dateOption(parsed.values.date), json: !!parsed.flags.json };
}

async function run(argv: string[]): Promise<void> {
  const verb = argv[0];
  if (verb === undefined) {
    const help = ["Usage: chub habits <command>", "", "Commands:"];
    for (const line of lines) help.push(`  ${line.replace(/^habits /, "")}`);
    console.log(help.join("\n"));
    return;
  }
  if (verb === "list") {
    const options = parseListOptions(argv.slice(1));
    await withData(async (db) => {
      const result = await listHabits(db, { archived: options.archived, section: options.section });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        const rendered = renderHabitList(result);
        if (rendered !== "") console.log(rendered);
      }
    });
    return;
  }
  if (verb === "done" || verb === "undo") {
    const options = parseDoneOptions(argv.slice(1));
    await withData(async (db) => {
      const result = await (verb === "done" ? doneHabit : undoHabit)(db, options.name, { date: options.date });
      console.log(options.json ? JSON.stringify(result, null, 2) : renderHabitDone(result));
    });
    return;
  }
  if (!["log", "set", "add", "rename", "archive", "unarchive", "field"].includes(verb)) {
    throw new UsageError(`Unknown habits command: ${verb}`);
  }

  const sub = verb === "field" ? argv[1] : undefined;
  if (verb === "field" && sub !== "add" && sub !== "update") throw new UsageError("habits field needs add or update");
  const valued =
    verb === "log"
      ? ["days", "from", "to"]
      : verb === "set"
        ? ["date"]
        : verb === "add"
          ? ["icon", "section"]
          : verb === "field"
            ? sub === "add"
              ? ["kind", "unit", "target"]
              : ["label", "unit", "target"]
            : [];
  const parsed = parseOptions(argv.slice(verb === "field" ? 2 : 1), valued, verb === "set" ? ["json", "clear"] : ["json"]);
  const { args, values, flags } = parsed;
  const required = verb === "set" ? (flags.clear && args.length === 2 ? 2 : 3) : verb === "rename" || verb === "field" ? 2 : 1;
  countArgs(args, required, `habits ${verb}`);

  const name = args[0] ?? "";
  const date = dateOption(values.date);
  const from = dateOption(values.from);
  const to = dateOption(values.to);
  if ((from === undefined) !== (to === undefined)) throw new UsageError("--from and --to must be given together");
  const days = values.days === undefined ? undefined : finite(values.days, "--days");
  if (days !== undefined && (!Number.isSafeInteger(days) || days < 1 || days > 365000)) {
    throw new UsageError("--days needs a positive integer");
  }
  const target = values.target === undefined ? undefined : finite(values.target, "--target");
  const kind = values.kind;
  if (verb === "field" && sub === "add" && kind !== "check" && kind !== "number" && kind !== "text") {
    throw new UsageError("--kind needs check, number or text");
  }
  const selectedSection = section(values.section);

  await withData(async (db) => {
    if (verb === "log") {
      const result = await logHabit(db, name, { days, from, to });
      if (flags.json) console.log(JSON.stringify(result, null, 2));
      else if (result.entries.length) {
        console.log(result.entries.map((entry) => `${entry.date}  ${entry.label} = ${entry.value}`).join("\n"));
      }
      return;
    }
    if (verb === "set") {
      const result = await setHabitValue(db, name, args[1] ?? "", args[2] ?? "", { date, clear: flags.clear });
      const text = `${result.habit.name}: ${result.field.label} = ${result.value} (${result.date})`;
      console.log(flags.json ? JSON.stringify(result, null, 2) : text);
      return;
    }
    const habit =
      verb === "add"
        ? await createHabit(db, name, { icon: values.icon, section: selectedSection })
        : verb === "rename"
          ? await changeHabit(db, name, { name: args[1] ?? "" })
          : verb === "archive" || verb === "unarchive"
            ? await changeHabit(db, name, { archived: verb === "archive" })
            : sub === "add"
              ? await addField(db, name, { label: args[1] ?? "", kind: kind as HabitFieldKind, unit: values.unit, target })
              : await updateField(db, name, args[1] ?? "", { label: values.label, unit: values.unit, target });
    console.log(flags.json ? JSON.stringify(habit, null, 2) : `${habit.name}${habit.archived ? " (archived)" : ""}`);
  });
}

export const habits: Command = { name: "habits", lines, run };
