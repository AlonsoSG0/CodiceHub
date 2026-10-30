import { afterEach, expect, test } from "bun:test";
import { cleanup, isolate, run } from "./helpers.js";

afterEach(cleanup);

test("preferences set and get JSON and raw string values", async () => {
  await isolate();
  const set = await run(["pref", "set", "workspace.timezone", "\"Europe/Madrid\"", "--json"]);
  expect(set.exitCode).toBe(0);
  expect(set.stderr).toBe("");
  expect(JSON.parse(set.stdout)).toEqual({ key: "workspace.timezone", value: "Europe/Madrid" });
  const raw = await run(["pref", "set", "appearance.theme", "dark"]);
  expect(raw).toEqual({ exitCode: 0, stdout: "appearance.theme = dark\n", stderr: "" });
  const get = await run(["pref", "get", "appearance.theme", "--json"]);
  expect(get.exitCode).toBe(0);
  expect(get.stderr).toBe("");
  expect(JSON.parse(get.stdout)).toEqual({ key: "appearance.theme", value: "dark" });
  const list = await run(["prefs", "--json"]);
  expect(list.exitCode).toBe(0);
  expect(list.stderr).toBe("");
  expect(JSON.parse(list.stdout).preferences).toMatchObject({ "workspace.timezone": "Europe/Madrid", "appearance.theme": "dark" });
});

test("invalid preference invocation leaves stored values unchanged", async () => {
  await isolate();
  await run(["pref", "set", "appearance.theme", "dark"]);
  const result = await run(["pref", "set", "appearance.theme"]);
  expect(result).toEqual({ exitCode: 2, stdout: "", stderr: "chub: pref set needs 2 argument(s)\nRun `chub --help` for the available commands.\n" });
  const get = await run(["pref", "get", "appearance.theme"]);
  expect(get).toEqual({ exitCode: 0, stdout: "appearance.theme = dark\n", stderr: "" });
});
