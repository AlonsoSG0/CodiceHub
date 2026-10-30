import { afterEach, expect, test } from "bun:test";
import { cleanup, isolate, run, seed, start, stop } from "./helpers.js";

afterEach(cleanup);

test("a data command writes while the server holds the same database", async () => {
  await isolate();
  const address = await start();
  await seed(address, "/api/habits", { name: "Reading" });

  // The server is still running: the CLI opens the same file as a second writer and must not fight it.
  const done = await run(["habits", "done", "Reading", "--json"]);
  expect(done.exitCode).toBe(0);
  const marked = JSON.parse(done.stdout) as { date: string; entries: Array<{ value: unknown }> };
  expect(marked.entries[0]?.value).toBe(true);

  // The write crossed the process boundary: the live server reads it back.
  const entries = (await (await fetch(`${address}/api/habits/entries?from=${marked.date}&to=${marked.date}`)).json()) as {
    entries: Array<{ date: string; value: unknown }>;
  };
  expect(entries.entries.map((entry) => entry.value)).toEqual([true]);

  // And so does a second CLI run.
  const listed = await run(["habits", "list", "--json"]);
  const habit = JSON.parse(listed.stdout) as { habits: Array<{ fields: Array<{ kind: string; value: unknown }> }> };
  expect(habit.habits[0]?.fields.find((field) => field.kind === "check")?.value).toBe(true);
  await stop();
});
