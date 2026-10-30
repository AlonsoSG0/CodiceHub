import { afterEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, isolate, run, seed, start, stop } from "./helpers.js";

afterEach(cleanup);

test("exports markdown by title or id, to stdout, JSON or a file", async () => {
  const home = await isolate();
  const address = await start();
  const page = await seed(address, "/api/pages", { title: "Export example" }) as { id: string; title: string };
  await seed(address, `/api/pages/${page.id}`, { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] } }, "PATCH");
  await stop();
  const plain = await run(["export", "Export example"]);
  expect(plain).toEqual({ exitCode: 0, stdout: "Hello", stderr: "" });
  const json = await run(["export", page.id, "--json"]);
  expect(json.exitCode).toBe(0);
  expect(json.stderr).toBe("");
  expect(JSON.parse(json.stdout)).toEqual({ page: { id: page.id, title: page.title }, format: "markdown", markdown: "Hello" });
  const path = join(home, "export.md");
  const file = await run(["export", "example", "--out", path]);
  expect(file).toEqual({ exitCode: 0, stdout: "", stderr: `${path}\n` });
  expect(await readFile(path, "utf8")).toBe("Hello");
});

test("export rejects missing, unknown and ambiguous pages", async () => {
  await isolate();
  const address = await start();
  await seed(address, "/api/pages", { title: "Alpha one" });
  await seed(address, "/api/pages", { title: "Alpha two" });
  await stop();
  const missing = await run(["export"]);
  expect(missing.exitCode).toBe(2);
  expect(missing.stdout).toBe("");
  expect(missing.stderr).toContain("export needs 1 argument(s)");
  for (const argument of ["unknown", "Alpha"]) {
    const result = await run(["export", argument]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(argument);
  }
});
