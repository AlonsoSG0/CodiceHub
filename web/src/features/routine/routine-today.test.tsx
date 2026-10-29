/* PROTOTYPE — prove the Today guide identifies the next block and records into the routine plus its linked mirror. */

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, type DayKey } from "@/features/habits/date";
import { loadRoutine } from "./routine-api";
import { stubRoutineApi } from "./routine-fixture";
import { RoutineToday } from "./routine-today";
import { useRoutineStore } from "./use-routine";

const today = "2026-06-08" as DayKey;
const now = new Date(2026, 5, 8, 9, 15);

function Harness({ initialDate = today }: { initialDate?: DayKey }) {
  const store = useRoutineStore();
  const [date, setDate] = useState(initialDate);
  return store.loading || store.state === null ? null : (
    <RoutineToday store={store} today={today} date={date} now={now} onDateChange={setDate} />
  );
}

beforeEach(() => {
  stubRoutineApi(today);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RoutineToday", () => {
  it("marks the block containing now and names the block after it as next", async () => {
    render(<Harness />);

    expect(await screen.findByRole("region", { name: "Current block" })).toHaveTextContent("Deep work");
    expect(screen.getByRole("region", { name: "Next block" })).toHaveTextContent("Lunch");
    expect(screen.getByRole("article", { name: "Deep work, 08:30 to 12:00" })).toHaveTextContent("Now");
  });

  it("records a block state and mirrors it to the linked habit", async () => {
    render(<Harness />);

    const readBlock = await screen.findByRole("article", { name: "Read, 08:00 to 08:30" });
    fireEvent.click(within(readBlock).getByRole("button", { name: "Done" }));

    await waitFor(() => expect(loadRoutine().then(({ state }) => state.occurrences)).resolves.toContainEqual({
      blockId: "1-2",
      date: today,
      status: "done",
      note: "",
    }));
    await waitFor(async () => {
      const { mirrors } = await loadRoutine();
      expect(mirrors).toContainEqual({ blockId: "1-2", date: today, target: "habit", targetId: "habit-read", written: true, reason: null });
    });
  });

  it("shows and records the next day's routine against that date", async () => {
    const previousDay = addDays(today, -1);
    render(<Harness initialDate={previousDay} />);

    fireEvent.click(await screen.findByRole("button", { name: "Next day" }));
    expect(await screen.findByRole("article", { name: "Deep work, 08:30 to 12:00" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("article", { name: "Read, 08:00 to 08:30" })).getByRole("button", { name: "Done" }));

    await waitFor(async () => expect((await loadRoutine()).state.occurrences).toContainEqual({
      blockId: "1-2",
      date: today,
      status: "done",
      note: "",
    }));
    expect((await loadRoutine()).state.occurrences).not.toContainEqual(expect.objectContaining({ blockId: "1-2", date: previousDay }));
  });

  it("disables recording on frozen days, keeps recent history writable, and leaves the timeline visible", async () => {
    const frozenDay = addDays(today, -7);
    render(<Harness initialDate={frozenDay} />);

    const readBlock = await screen.findByRole("article", { name: "Read, 08:00 to 08:30" });
    expect(screen.getByText("This day is closed.")).toBeInTheDocument();
    expect(within(readBlock).getByRole("button", { name: "Done" })).toBeDisabled();
    expect(within(readBlock).getByRole("textbox", { name: "Note for Read" })).toBeDisabled();
    expect(within(readBlock).getByRole("button", { name: "Save note" })).toBeDisabled();
    expect((await loadRoutine()).state.occurrences.filter((occurrence) => occurrence.date === frozenDay)).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(await screen.findByRole("article", { name: "Read, 08:00 to 08:30" })).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Read, 08:00 to 08:30" })).getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("disables future-day controls and does not write", async () => {
    const futureDay = addDays(today, 1);
    render(<Harness initialDate={futureDay} />);

    const readBlock = await screen.findByRole("article", { name: "Read, 08:00 to 08:30" });
    expect(within(readBlock).getByRole("button", { name: "Done" })).toBeDisabled();
    expect(within(readBlock).getByRole("textbox", { name: "Note for Read" })).toBeDisabled();
    expect(within(readBlock).getByRole("button", { name: "Save note" })).toBeDisabled();
    expect((await loadRoutine()).state.occurrences.filter((occurrence) => occurrence.date === futureDay)).toEqual([]);
  });
});
