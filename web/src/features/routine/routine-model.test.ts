import { describe, expect, it } from "vitest";
import {
  currentBlock,
  isFrozenDay,
  nextBlock,
  noteOf,
  segmentsOfDay,
  statusOf,
  tallyOf,
  weekDates,
  weekTallyOf,
  windowOf,
} from "./routine-model";
import type { RoutineBlock, RoutineOccurrence, RoutineSettings, RoutineState, Weekday } from "./types";
import { WEEKDAYS } from "./types";

const settings: RoutineSettings = { weekStartsOn: 1, dayStart: "07:00", dayEnd: "23:00", dayWindows: {}, editWindowDays: 7 };

function block(id: string, start: string, end: string, input: Partial<RoutineBlock> = {}): RoutineBlock {
  return { id, title: id, start, end, intent: "must", link: null, note: "", ...input };
}

function stateOf(days: Partial<Record<Weekday, RoutineBlock[]>>, occurrences: RoutineOccurrence[] = []): RoutineState {
  return {
    settings,
    days: WEEKDAYS.map((weekday) => ({ weekday, blocks: days[weekday] ?? [], isTemplate: false })),
    occurrences,
  };
}

describe("segmentsOfDay", () => {
  it("cuts the 24 hours into sleep outside the window, gaps inside it, and the blocks", () => {
    const state = stateOf({ 1: [block("read", "08:00", "08:30")] });
    const segments = segmentsOfDay(state, 1);

    expect(segments[0]).toEqual({ kind: "sleep", start: "00:00", end: "07:00" });
    expect(segments[1]).toEqual({ kind: "gap", start: "07:00", end: "08:00" });
    expect(segments[2]).toEqual({ kind: "block", start: "08:00", end: "08:30", block: state.days[1].blocks[0] });
    expect(segments.at(-1)).toEqual({ kind: "sleep", start: "23:00", end: "24:00" });
  });
});

describe("windowOf", () => {
  it("follows the global window unless the weekday carries its own", () => {
    const state = stateOf({});
    state.settings.dayWindows = { 6: { start: "09:00", end: "21:00" } };

    expect(windowOf(state, 1)).toEqual({ start: "07:00", end: "23:00" });
    expect(windowOf(state, 6)).toEqual({ start: "09:00", end: "21:00" });
    expect(segmentsOfDay(state, 6)[0]).toEqual({ kind: "sleep", start: "00:00", end: "09:00" });
  });
});

describe("currentBlock and nextBlock", () => {
  const blocks = [block("a", "08:00", "09:00"), block("b", "10:00", "11:00")];

  it("find the block holding the minute and the first one after it", () => {
    expect(currentBlock(blocks, 8 * 60 + 30)?.id).toBe("a");
    expect(nextBlock(blocks, 8 * 60 + 30)?.id).toBe("b");
  });

  it("report nothing in progress inside a gap", () => {
    expect(currentBlock(blocks, 9 * 60 + 30)).toBeNull();
    expect(nextBlock(blocks, 9 * 60 + 30)?.id).toBe("b");
  });
});

describe("isFrozenDay", () => {
  it.each([
    [3, "2026-05-11", "2026-05-10"],
    [7, "2026-05-07", "2026-05-06"],
  ] as const)("uses the inclusive %i-day history window", (editWindowDays, oldestEditable, oldestFrozen) => {
    const state = stateOf({});
    state.settings.editWindowDays = editWindowDays;

    expect(isFrozenDay(state, oldestEditable, "2026-05-13")).toBe(false);
    expect(isFrozenDay(state, oldestFrozen, "2026-05-13")).toBe(true);
  });
});

describe("statusOf", () => {
  const today = "2026-05-13";
  const read = block("read", "08:00", "09:00");

  it("reads a closed day with no record as missed and today with no record as pending", () => {
    const state = stateOf({ 3: [read] });
    expect(statusOf(state, read, "2026-05-12", today)).toBe("missed");
    expect(statusOf(state, read, today, today)).toBe("pending");
  });

  it("lets a recorded state win, including the one that excuses the block", () => {
    const state = stateOf({ 3: [read] }, [{ blockId: "read", date: "2026-05-12", status: "excused", note: "Travel" }]);
    expect(statusOf(state, read, "2026-05-12", today)).toBe("excused");
  });

  it("keeps a note written before the state was chosen, and still misses the closed day", () => {
    // 2026-05-12 is a Tuesday, so the block has to hang off weekday 2 for the day lookup to find it.
    const state = stateOf({ 2: [read] }, [
      { blockId: "read", date: "2026-05-12", status: "pending", note: "Ran out of time" },
    ]);
    expect(noteOf(state, "read", "2026-05-12")).toBe("Ran out of time");
    expect(statusOf(state, read, "2026-05-12", today)).toBe("missed");
    expect(tallyOf(state, "2026-05-12", today)).toMatchObject({ missed: 1, expected: 1 });
  });
});

describe("tallyOf and weekTallyOf", () => {
  // 2026-05-13 is a Wednesday, so the week starting on Monday has 05-11 and 05-12 closed and 05-13 in progress.
  const today = "2026-05-13";
  const state = stateOf({
    1: [
      block("done", "08:00", "09:00"),
      block("missed", "09:00", "10:00"),
      block("excused", "10:00", "11:00"),
      block("want", "11:00", "12:00", { intent: "want" }),
    ],
    3: [block("today", "08:00", "09:00")],
  }, [
    { blockId: "done", date: "2026-05-11", status: "done", note: "" },
    { blockId: "excused", date: "2026-05-11", status: "excused", note: "" },
  ]);

  it("counts obligations only, and never the ones that were excused or skipped", () => {
    const tally = tallyOf(state, "2026-05-11", today);
    expect(tally).toMatchObject({ done: 1, missed: 1, expected: 2, excused: 1, wants: 1 });
  });

  it("leaves today out of the weekly rate", () => {
    expect(tallyOf(state, today, today)).toMatchObject({ done: 0, expected: 0, pending: 1 });
    expect(weekTallyOf(state, today)).toEqual({ done: 1, expected: 2, closed: 2, rate: 50 });
  });
});

describe("weekDates", () => {
  it("returns the seven days of the week that contains the given day, starting on the user's first day", () => {
    expect(weekDates(1, "2026-05-13")).toEqual([
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
    ]);
    expect(weekDates(0, "2026-05-13")[0]).toBe("2026-05-10");
  });
});
