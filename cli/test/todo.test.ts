import { afterEach, expect, test } from "bun:test";
import { cleanup, isolate, run, seed, start, stop } from "./helpers.js";

afterEach(cleanup);

test("todo adds to existing lists and shows relevant open items", async () => {
  await isolate();
  const address = await start();
  const list = await seed(address, "/api/checklists", { name: "Work" }) as { id: string };
  const other = await seed(address, "/api/checklists", { name: "Home" }) as { id: string };
  const future = await seed(address, `/api/checklists/${list.id}/items`, { text: "Future" }) as { id: string };
  await seed(address, `/api/checklists/items/${future.id}`, { dueDate: "9999-12-31" }, "PATCH");
  await stop();
  const added = await run(["todo", "add", "Buy milk #Home", "--due", "2000-01-01", "--priority", "high"]);
  expect(added.exitCode).toBe(0);
  const view = await run(["todo", "--json"]);
  expect(view.exitCode).toBe(0);
  expect(view.stderr).toBe("");
  const lists = JSON.parse(view.stdout).checklists as Array<{ id: string; items: Array<{ text: string; priority: string }> }>;
  expect(lists.find((row) => row.id === other.id)?.items).toMatchObject([{ text: "Buy milk", priority: "high" }]);
  expect(view.stdout).not.toContain("Future");
  const listed = await run(["todo", "lists", "--json"]);
  expect(listed.exitCode).toBe(0);
  expect(JSON.parse(listed.stdout).checklists).toHaveLength(2);
  const before = listed.stdout;
  const rejected = await run(["todo", "add", "Bad", "--list", "Missing"]);
  expect(rejected.exitCode).toBe(2);
  expect(rejected.stdout).toBe("");
  expect(rejected.stderr).toContain("Work, Home");
  expect((await run(["todo", "lists", "--json"])).stdout).toBe(before);
});

test("check resolves open items and reports a scheduled recurrence", async () => {
  await isolate();
  const address = await start();
  const list = await seed(address, "/api/checklists", { name: "Work" }) as { id: string };
  const item = await seed(address, `/api/checklists/${list.id}/items`, { text: "Repeat" }) as { id: string };
  await seed(address, `/api/checklists/items/${item.id}`, { dueDate: "2000-01-01", recurrence: "daily" }, "PATCH");
  await stop();
  const checked = await run(["todo", "check", "Repeat"]);
  expect(checked.exitCode).toBe(0);
  expect(checked.stdout).toBe("");
  expect(checked.stderr).toContain("next occurrence");
  const view = await run(["todo", "--json"]);
  expect(JSON.parse(view.stdout).checklists[0].items).toMatchObject([{ text: "Repeat", done: false, dueDate: "2000-01-02" }]);
});
