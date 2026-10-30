import { afterEach, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, isolate, run } from "./helpers.js";

afterEach(cleanup);

test("backups lists and rotates created backups", async () => {
  const home = await isolate();
  const empty = await run(["backups", "--json"]);
  expect(empty.exitCode).toBe(0);
  expect(empty.stderr).toBe("");
  expect(JSON.parse(empty.stdout)).toEqual({ backups: [] });
  for (let i = 0; i < 4; i++) {
    const result = await run(["backup", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const { name } = JSON.parse(result.stdout) as { name: string };
    expect(name).toMatch(/^chub-\d{8}-\d{6}(?:-\d+)?\.db$/);
    expect((await stat(join(home, "backups", name))).isFile()).toBe(true);
  }
  const listed = await run(["backups", "--json"]);
  expect(JSON.parse(listed.stdout).backups).toHaveLength(3);
  const human = await run(["backup"]);
  expect(human.exitCode).toBe(0);
  expect(human.stdout).toContain(join(home, "backups"));
});

test("backup rejects unexpected arguments without creating a backup", async () => {
  await isolate();
  const result = await run(["backup", "extra"]);
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("backup needs 0 argument(s)");
  expect(JSON.parse((await run(["backups", "--json"])).stdout)).toEqual({ backups: [] });
});
