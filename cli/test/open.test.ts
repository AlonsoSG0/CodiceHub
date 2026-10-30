import { expect, test } from "bun:test";
import { browserCommand } from "../src/open.js";

const url = "http://127.0.0.1:3000";

test("each platform gets its own opener", () => {
  expect(browserCommand(url, "linux")).toEqual(["xdg-open", url]);
  expect(browserCommand(url, "darwin")).toEqual(["open", url]);
  expect(browserCommand(url, "win32")).toEqual(["cmd", "/c", "start", "", url]);
});
