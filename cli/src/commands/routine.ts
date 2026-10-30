import { UsageError, countArgs, dateOption, parseOptions, withData, type Command } from "../command.js";
import { call, resolveDay } from "../ops.js";

type Block = {
  id: string;
  weekday: number;
  title: string;
  start: string;
  end: string;
  intent: string;
  link: { kind: string; id: string } | null;
};
type Occurrence = { blockId: string; date: string; status: string };
type Snapshot = { settings: { weekStartsOn: number }; blocks: Block[]; occurrences: Occurrence[] };

function dateValue(day: string): Date {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new UsageError(`expected a YYYY-MM-DD day, got ${day}`);
  }
  return date;
}

export const day: Command = {
  name: "day",
  lines: ["day [--date <day>] [--json]"],
  async run(argv) {
    const { args, values, flags } = parseOptions(argv, ["date"], ["json"]);
    countArgs(args, 0, "day");
    const override = dateOption(values.date);
    if (override !== undefined) dateValue(override);
    await withData(async (db) => {
      const { date } = await resolveDay(db, override);
      const snapshot = await call(db, "/api/routine") as Snapshot;
      const weekday = dateValue(date).getUTCDay();
      const statuses = new Map(snapshot.occurrences.filter((row) => row.date === date).map((row) => [row.blockId, row.status]));
      const blocks = snapshot.blocks.filter((block) => block.weekday === weekday)
        .map((block) => ({ ...block, status: statuses.get(block.id) ?? "not recorded" }));
      if (flags.json) console.log(JSON.stringify({ date, weekday, blocks }, null, 2));
      else if (blocks.length) console.log(blocks.map((block) =>
        `${block.start}-${block.end}  ${block.title}  ${block.intent}  ${block.link ? `${block.link.kind}:${block.link.id}` : "—"}  ${block.status}`,
      ).join("\n"));
    });
  },
};

export const week: Command = {
  name: "week",
  lines: ["week [--json]"],
  async run(argv) {
    const { args, flags } = parseOptions(argv, [], ["json"]);
    countArgs(args, 0, "week");
    await withData(async (db) => {
      const { date } = await resolveDay(db);
      const snapshot = await call(db, "/api/routine") as Snapshot;
      const first = dateValue(date);
      first.setUTCDate(first.getUTCDate() - (first.getUTCDay() - snapshot.settings.weekStartsOn + 7) % 7);
      const days = Array.from({ length: 7 }, (_, index) => {
        const current = new Date(first);
        current.setUTCDate(first.getUTCDate() + index);
        const day = current.toISOString().slice(0, 10);
        const counts: Record<string, number> = {};
        for (const occurrence of snapshot.occurrences) {
          if (occurrence.date === day) counts[occurrence.status] = (counts[occurrence.status] ?? 0) + 1;
        }
        return { date: day, weekday: current.getUTCDay(), counts };
      });
      if (flags.json) console.log(JSON.stringify({ days }, null, 2));
      else console.log(days.map((day) => `${day.date}  ${Object.entries(day.counts).map(([status, count]) => `${status}: ${count}`).join(", ") || "no recorded statuses"}`).join("\n"));
    });
  },
};
