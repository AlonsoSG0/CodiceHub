import { afterEach, expect, test } from "bun:test";
import { cleanup, isolate, run, seed, start, stop } from "./helpers.js";

afterEach(cleanup);

test("search returns page titles and ids in text and JSON, and nothing for no matches", async () => {
  await isolate();
  const address = await start();
  const page = (await seed(address, "/api/pages", { title: "Zebra notebook" })) as { id: string };
  await stop();
  const text = await run(["search", "Zebra"]);
  expect(text.exitCode).toBe(0);
  expect(text.stderr).toBe("");
  expect(text.stdout).toContain("Zebra notebook");
  expect(text.stdout).toContain(page.id);
  const json = await run(["search", "Zebra", "--json"]);
  expect(json.exitCode).toBe(0);
  expect(json.stderr).toBe("");
  expect(JSON.parse(json.stdout).results[0]).toMatchObject({ id: page.id, title: "Zebra notebook" });
  const empty = await run(["search", "unfindableword"]);
  expect(empty).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

test("search requires a query", async () => {
  await isolate();
  expect(await run(["search"])).toEqual({
    exitCode: 2, stdout: "", stderr: "chub: search needs 1 argument(s)\nRun `chub --help` for the available commands.\n",
  });
});
