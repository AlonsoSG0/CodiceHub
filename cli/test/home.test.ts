import { expect, test } from "bun:test";
import { dataHome } from "../src/context.js";

test("CHUB_HOME wins on every platform", () => {
  expect(dataHome({ CHUB_HOME: "/tmp/here" }, "linux")).toBe("/tmp/here");
  expect(dataHome({ CHUB_HOME: "/tmp/here" }, "win32")).toBe("/tmp/here");
});

test("Windows uses LOCALAPPDATA, not a Unix hidden directory", () => {
  expect(dataHome({ LOCALAPPDATA: "/Users/ana/AppData/Local" }, "win32")).toBe("/Users/ana/AppData/Local/chub");
});

test("Linux and macOS keep ~/.local/share/chub", () => {
  expect(dataHome({ HOME: "/home/ana" }, "linux")).toBe("/home/ana/.local/share/chub");
  expect(dataHome({ HOME: "/Users/ana" }, "darwin")).toBe("/Users/ana/.local/share/chub");
});

test("a Windows profile without LOCALAPPDATA still gets a data home", () => {
  expect(dataHome({ HOME: "/Users/ana" }, "win32")).toBe("/Users/ana/.local/share/chub");
});
