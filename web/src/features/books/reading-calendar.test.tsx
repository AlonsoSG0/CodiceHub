import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingCalendar } from "./reading-calendar";
import type { Habit, HabitEntry } from "@/features/habits/habits-api";

const habit: Habit = {
  id: "reading",
  name: "Reading",
  icon: null,
  position: 0,
  section: "books",
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  fields: [
    { id: "done", habitId: "reading", kind: "check", label: "Done", unit: null, target: null, position: 0, archivedAt: null },
  ],
};

const today = "2026-04-15"; // a Wednesday
// The week the selected day belongs to runs Monday 2026-04-13 to Sunday 2026-04-19.

function entry(date: string, value: HabitEntry["value"] = true): HabitEntry {
  return { habitId: "reading", fieldId: "done", date, kind: "check", value };
}

function renderCalendar(overrides: Partial<React.ComponentProps<typeof ReadingCalendar>> = {}) {
  const onSelectDay = vi.fn();
  render(
    <ReadingCalendar
      habit={habit}
      entries={[]}
      today={today}
      selectedDay={today}
      from="2026-01-15"
      onSelectDay={onSelectDay}
      {...overrides}
    />,
  );
  return { onSelectDay };
}

afterEach(cleanup);

describe("ReadingCalendar", () => {
  it("shows the whole week the selected day belongs to", () => {
    renderCalendar();

    expect(screen.getByRole("button", { name: "Monday, April 13" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sunday, April 19/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /April/ })).toHaveLength(7);
  });

  it("marks the selected day as the current date and today as today", () => {
    renderCalendar();

    expect(screen.getByRole("button", { name: "Wednesday, April 15, today" })).toHaveAttribute(
      "aria-current",
      "date",
    );
  });

  it("announces the days that have reading logged", () => {
    renderCalendar({ entries: [entry("2026-04-14")] });

    expect(screen.getByRole("button", { name: "Tuesday, April 14, reading logged" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wednesday, April 15, today" })).not.toHaveTextContent("logged");
  });

  it("selects a day when its chip is clicked", () => {
    const { onSelectDay } = renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "Friday, April 17" }));

    expect(onSelectDay).toHaveBeenCalledWith("2026-04-17");
  });

  it("walks back a week and forward a week", () => {
    const { onSelectDay } = renderCalendar();

    // The window is the week the selected day belongs to, so a step lands on the neighbouring Monday.
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-04-06");

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-04-20");
  });

  it("never reaches back further than the first reachable day", () => {
    renderCalendar({ selectedDay: "2026-01-19", from: "2026-01-15" });

    // The week of 2026-01-19 runs from Monday the 19th, so the week before it starts before the bound.
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next week" })).not.toBeDisabled();
  });
});
