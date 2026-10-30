import { afterEach, expect, test } from "bun:test";
import { cleanup, isolate, run, seed, start, stop } from "./helpers.js";

afterEach(cleanup);

test("routine status records occurrences, reports mirrors and rejects invalid requests", async () => {
  await isolate();
  const address = await start();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const seeded = await seed(address, `/api/routine/days/${weekday}/blocks`, { title: "Read", start: "09:00", end: "10:00", link: { kind: "habit", id: "missing" } }) as { blocks: Array<{ id: string }> };
  const id = seeded.blocks[0]!.id;
  await seed(address, `/api/routine/days/${weekday}/blocks`, { title: "Read", start: "10:00", end: "11:00" });
  await stop();

  const help = await run(["routine"]);
  expect(help.exitCode).toBe(0);
  expect(help.stdout).toContain("status <block> <status>");
  expect(help.stderr).toBe("");
  const ambiguous = await run(["routine", "status", "Read", "done"]);
  expect(ambiguous.exitCode).toBe(1);
  expect(ambiguous.stdout).toBe("");
  expect(ambiguous.stderr).toContain("09:00-10:00");
  expect(ambiguous.stderr).toContain("10:00-11:00");
  const recorded = await run(["routine", "status", id, "done", "--note", "Finished", "--json"]);
  expect(recorded.exitCode).toBe(0);
  expect(recorded.stderr).toBe("");
  const snapshot = JSON.parse(recorded.stdout);
  expect(snapshot.occurrences).toContainEqual({ blockId: id, date: today, status: "done", note: "Finished" });
  expect(snapshot.mirrors).toContainEqual({ blockId: id, date: today, target: "habit", targetId: "missing", written: false, reason: "target_missing" });
  const text = await run(["routine", "status", id, "skipped", "--date", today]);
  expect(text.exitCode).toBe(0);
  expect(text.stderr).toBe("");
  expect(text.stdout).toContain("skipped");
  expect(text.stdout).toContain("target_missing");
  const before = await run(["day", "--date", today, "--json"]);
  const bad = await run(["routine", "status", id, "invalid"]);
  expect(bad.exitCode).toBe(2);
  expect(bad.stdout).toBe("");
  expect(bad.stderr).toContain("status needs pending, done, missed, excused or skipped");
  const old = new Date(`${today}T12:00:00Z`);
  old.setUTCDate(old.getUTCDate() - 14);
  const frozen = await run(["routine", "status", id, "done", "--date", old.toISOString().slice(0, 10)]);
  expect(frozen.exitCode).toBe(1);
  expect(frozen.stdout).toBe("");
  expect(frozen.stderr).toContain("date_frozen");
  const after = await run(["day", "--date", today, "--json"]);
  expect(after.stdout).toBe(before.stdout);
});

test("day and week show only stored routine statuses", async () => {
  await isolate();
  const address = await start();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const snapshot = await seed(address, `/api/routine/days/${weekday}/blocks`, {
    title: "Read", start: "09:00", end: "10:00", intent: "must", link: { kind: "goal", id: "goal-1" },
  }) as { blocks: Array<{ id: string }> };
  const id = snapshot.blocks[0]!.id;
  await seed(address, `/api/routine/days/${weekday}/blocks`, { title: "Walk", start: "10:00", end: "11:00", intent: "want" });
  await seed(address, `/api/routine/blocks/${id}/occurrences/${today}`, { status: "excused" }, "PUT");
  await seed(address, "/api/routine/settings", { weekStartsOn: weekday }, "PUT");
  await stop();

  const day = await run(["day", "--date", today]);
  expect(day.exitCode).toBe(0);
  expect(day.stderr).toBe("");
  expect(day.stdout).toContain("09:00-10:00  Read  must  goal:goal-1  excused");
  expect(day.stdout).toContain("10:00-11:00  Walk  want  —  not recorded");
  const json = await run(["day", "--date", today, "--json"]);
  expect(json.exitCode).toBe(0);
  expect(json.stderr).toBe("");
  expect(JSON.parse(json.stdout).blocks.map((block: { status: string }) => block.status)).toEqual(["excused", "not recorded"]);
  const week = await run(["week", "--json"]);
  expect(week.exitCode).toBe(0);
  expect(week.stderr).toBe("");
  const days = JSON.parse(week.stdout).days;
  expect(days).toHaveLength(7);
  expect(days[0]).toMatchObject({ date: today, weekday, counts: { excused: 1 } });
  const text = await run(["week"]);
  expect(text.exitCode).toBe(0);
  expect(text.stderr).toBe("");
  expect(text.stdout.trim().split("\n")).toHaveLength(7);
  expect(text.stdout).toContain(`${today}  excused: 1`);
  const bad = await run(["day", "--date", "bad"]);
  expect(bad.exitCode).toBe(2);
  expect(bad.stdout).toBe("");
  expect(bad.stderr).toContain("expected a YYYY-MM-DD day, got bad");
  const after = await run(["day", "--date", today, "--json"]);
  expect(after.stdout).toBe(json.stdout);
});
