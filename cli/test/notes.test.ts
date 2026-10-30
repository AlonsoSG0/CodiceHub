import { afterEach, expect, test } from "bun:test";
import { cleanup, isolate, run, seed, start, stop } from "./helpers";

afterEach(cleanup);

test("notes render the tree and expose full pages as JSON", async () => {
  await isolate();
  const address = await start();
  const root = (await seed(address, "/api/pages", { title: "Root" })) as { id: string };
  const child = (await seed(address, "/api/pages", { parentId: root.id })) as { id: string };
  await stop();

  const tree = await run(["notes"]);
  expect(tree.exitCode).toBe(0);
  expect(tree.stderr).toBe("");
  expect(tree.stdout).toBe(`Root  ${root.id}\n  Untitled  ${child.id}\n`);
  const json = await run(["notes", "--json"]);
  expect(json.exitCode).toBe(0);
  expect(JSON.parse(json.stdout).pages.map((page: { id: string }) => page.id)).toContain(child.id);
  const page = await run(["note", child.id, "--json"]);
  expect(page.exitCode).toBe(0);
  expect(JSON.parse(page.stdout)).toMatchObject({ id: child.id, parentId: root.id, title: "", content: { type: "doc", content: [] } });
});

test("notes create, rename, show backlinks, delete and restore by title", async () => {
  await isolate();
  const address = await start();
  const parent = (await seed(address, "/api/pages", { title: "Parent" })) as { id: string };
  const source = (await seed(address, "/api/pages", { title: "Source" })) as { id: string };
  await stop();
  const created = await run(["note", "new", "--title", "Child", "--parent", "Parent"]);
  expect(created.exitCode).toBe(0);
  expect(created.stderr).toBe("");
  const childId = created.stdout.trim().split(/\s+/).at(-1)!;
  const renamed = await run(["note", "rename", "Child", "Renamed"]);
  expect(renamed.exitCode).toBe(0);
  expect(renamed.stdout).toBe(`Renamed  ${childId}\n`);
  const show = await run(["note", "Renamed", "--json"]);
  expect(JSON.parse(show.stdout)).toMatchObject({ id: childId, parentId: parent.id, title: "Renamed" });

  const again = await start();
  await seed(again, `/api/pages/${source.id}`, { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "See " }, { type: "pageMention", attrs: { pageId: childId } }] }] } }, "PATCH");
  await stop();
  const backlinks = await run(["note", "backlinks", "Renamed"]);
  expect(backlinks.exitCode).toBe(0);
  expect(backlinks.stdout).toBe(`Source  ${source.id}  See\n`);
  expect((await run(["note", "rm", "Renamed"])).exitCode).toBe(0);
  expect((await run(["note", "restore", "Renamed"])).exitCode).toBe(0);
  expect(JSON.parse((await run(["note", childId, "--json"])).stdout).deletedAt).toBeNull();
});

test("invalid and ambiguous invocations leave pages unchanged", async () => {
  await isolate();
  const address = await start();
  await seed(address, "/api/pages", { title: "Alpha one" });
  await seed(address, "/api/pages", { title: "Alpha two" });
  await stop();
  const before = await run(["notes", "--json"]);
  const ambiguous = await run(["note", "rm", "Alpha"]);
  expect(ambiguous.exitCode).toBe(1);
  expect(ambiguous.stdout).toBe("");
  expect(ambiguous.stderr).toContain('"Alpha" is ambiguous:');
  const invalid = await run(["note", "rename", "Alpha one"]);
  expect(invalid.exitCode).toBe(2);
  expect(invalid.stdout).toBe("");
  expect(invalid.stderr).toContain("note rename needs 2 argument(s)");
  expect((await run(["notes", "--json"])).stdout).toBe(before.stdout);
});
