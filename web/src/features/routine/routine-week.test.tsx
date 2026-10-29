import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayKey } from "@/features/habits/date";
import { stubRoutineApi } from "./routine-fixture";
import { RoutineWeek } from "./routine-week";
import { useRoutineStore } from "./use-routine";

const today = "2026-01-06" as DayKey;
const monday = "2026-01-05" as DayKey;

function RoutineWeekHarness() {
  const store = useRoutineStore();
  return store.loading || store.state === null ? null : <RoutineWeek store={store} today={today} />;
}

beforeEach(() => {
  stubRoutineApi(today);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RoutineWeek", () => {
  it("scores only required obligations on closed days and never counts today", async () => {
    render(<RoutineWeekHarness />);

    expect(await screen.findByText("Weekly rate:", { exact: false })).toBeInTheDocument();
    // Monday is the only closed day of this week: three done and one missed obligation. Tuesday, today, holds five
    // more obligations, so this number can only be right if today was left out of the rate.
    expect(screen.getByText("4/5", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/required blocks on days before today; optional blocks and today are not scored/)).toBeInTheDocument();
    expect(screen.getByText("Tuesday", { selector: "h3" })).toBeInTheDocument();
  });

  it("shows today and the two following days in the three-day range", async () => {
    render(<RoutineWeekHarness />);

    const range = await screen.findByRole("combobox", { name: "Range" });
    fireEvent.change(range, { target: { value: "three-days" } });

    expect(screen.getByRole("heading", { name: "Next three days" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tuesday" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wednesday" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thursday" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Monday,/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Friday,/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tuesday, January 6, 2026, Today" })).toBeInTheDocument();
  });

  it("writes a three-day-range mark for the date shown", async () => {
    render(<RoutineWeekHarness />);

    const range = await screen.findByRole("combobox", { name: "Range" });
    fireEvent.change(range, { target: { value: "three-days" } });
    fireEvent.change(await screen.findByRole("combobox", { name: `Stretch state on ${today}` }), {
      target: { value: "done" },
    });

    await waitFor(() => expect(screen.getByRole("combobox", { name: `Stretch state on ${today}` })).toHaveValue("done"));
  });

  it("keeps the routine record when marking a block whose linked target is missing", async () => {
    render(<RoutineWeekHarness />);

    const status = await screen.findByRole("combobox", { name: `Stretch state on ${monday}` });
    fireEvent.change(status, { target: { value: "done" } });

    await waitFor(() => expect(status).toHaveValue("done"));
    expect(await screen.findByText("Link target missing; the routine record still stands.")).toBeInTheDocument();
  });
});
