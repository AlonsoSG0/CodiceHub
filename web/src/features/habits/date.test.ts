import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKeyOf,
  dayKeysBetween,
  daysInMonth,
  isDayKey,
  monthBounds,
  parseDayKey,
  shiftMonth,
  todayKey,
  weekBuckets,
  weekStartKey,
} from "./date";

const dateSource = readFileSync(resolve(process.cwd(), "src/features/habits/date.ts"), "utf8");
const apiSource = readFileSync(resolve(process.cwd(), "src/features/habits/habits-api.ts"), "utf8");

/** The prohibition is about executed code, so the comments that name the forbidden conversion are stripped first. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("habit day keys", () => {
  it("reads the local calendar day of an instant, not the UTC one", () => {
    // Both ends of the same local day must produce one key: an implementation that sliced an ISO string
    // would return two different days here for any user whose offset is not zero.
    expect(dayKeyOf(new Date(2026, 0, 5, 0, 0, 0))).toBe("2026-01-05");
    expect(dayKeyOf(new Date(2026, 0, 5, 23, 59, 59))).toBe("2026-01-05");
    expect(todayKey(new Date(2026, 11, 31, 12, 0, 0))).toBe("2026-12-31");
  });

  it("advances exactly one calendar day at a time across a whole year", () => {
    let key = "2026-01-01";
    for (let step = 0; step < 365; step += 1) {
      const next = addDays(key, 1);
      expect(next, `step ${step} from ${key}`).not.toBe(key);
      // A fixed 24-hour arithmetic would drift by a day across a daylight-saving transition.
      expect(dayKeyOf(new Date(parseDayKey(next).year, parseDayKey(next).month - 1, parseDayKey(next).day))).toBe(next);
      key = next;
    }
    expect(key).toBe("2027-01-01");
  });

  it("crosses month and year boundaries in both directions", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("lists an inclusive range between two days", () => {
    expect(dayKeysBetween("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
    expect(dayKeysBetween("2026-01-05", "2026-01-05")).toEqual(["2026-01-05"]);
    expect(dayKeysBetween("2026-01-06", "2026-01-05")).toEqual([]);
  });

  it("refuses a day that does not exist in the calendar", () => {
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("2026-02-29")).toBe(false);
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("05/01/2026")).toBe(false);
    expect(() => parseDayKey("2026-02-30")).toThrow();
  });

  it("finds the Monday that starts a week", () => {
    expect(weekStartKey("2026-01-07")).toBe("2026-01-05");
    expect(weekStartKey("2026-01-05")).toBe("2026-01-05");
    expect(weekStartKey("2026-01-11")).toBe("2026-01-05");
    expect(weekStartKey("2026-01-12")).toBe("2026-01-12");
  });

  it("buckets an ordered range into whole weeks", () => {
    const buckets = weekBuckets(dayKeysBetween("2026-01-07", "2026-01-20"));

    expect(buckets.map((bucket) => bucket.key)).toEqual(["2026-01-05", "2026-01-12", "2026-01-19"]);
    expect(buckets[0]!.days).toEqual(["2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10", "2026-01-11"]);
    expect(buckets.flatMap((bucket) => bucket.days)).toEqual(dayKeysBetween("2026-01-07", "2026-01-20"));
  });

  it("lists a month and shifts months across year boundaries", () => {
    expect(daysInMonth("2026-02")).toHaveLength(28);
    expect(daysInMonth("2028-02")).toHaveLength(29);
    expect(daysInMonth("2026-01")).toHaveLength(31);
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-06", 0)).toBe("2026-06");
  });

  it("never converts a day through UTC", () => {
    // S8: the ISO string form shifts the day for every user off UTC, so no code in this feature may use it.
    expect(withoutComments(dateSource)).not.toMatch(/toISOString/);
    expect(withoutComments(apiSource)).not.toMatch(/toISOString/);
  });
});
