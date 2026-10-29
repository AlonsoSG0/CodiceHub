import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckInPanel } from "./check-in-panel";
import type { Habit } from "./habits-api";

const habit: Habit = {
  id: "h1",
  name: "Reading",
  icon: null,
  position: 0,
  section: "habits",
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  fields: [
    { id: "done", habitId: "h1", kind: "check", label: "Done", unit: null, target: null, position: 0, archivedAt: null },
  ],
};

const today = "2026-04-15"; // a Wednesday
const yesterday = "2026-04-14";
const tomorrow = "2026-04-16";

function renderPanel(overrides: Partial<React.ComponentProps<typeof CheckInPanel>> = {}) {
  const onSelectDay = vi.fn();
  const onSetValues = vi.fn().mockResolvedValue(undefined);
  render(
    <CheckInPanel
      habits={[habit]}
      entries={[]}
      today={today}
      selectedDay={today}
      onSelectDay={onSelectDay}
      onSetValues={onSetValues}
      {...overrides}
    />,
  );
  return { onSelectDay, onSetValues };
}

afterEach(cleanup);

describe("CheckInPanel", () => {
  it("shows the selected day, Today marker, and a seven-day strip", () => {
    renderPanel();

    expect(screen.getByRole("region", { name: "Today check-ins" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wed, Apr 15" })).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), Apr \d+$/ })).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Wed, Apr 15" })).toHaveAttribute("aria-current", "date");
  });

  it("marks future dates disabled and never sends a write for them", () => {
    const { onSelectDay, onSetValues } = renderPanel();

    const future = screen.getByRole("button", { name: "Thu, Apr 16" });
    expect(future).toBeDisabled();

    const past = screen.getByRole("button", { name: "Tue, Apr 14" });
    expect(past).not.toBeDisabled();
    fireEvent.click(future);
    expect(onSelectDay).not.toHaveBeenCalledWith(tomorrow);
    expect(onSetValues).not.toHaveBeenCalled();
  });

  it("moves between days and offers a direct return to today", () => {
    const { onSelectDay } = renderPanel({ selectedDay: yesterday });

    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(onSelectDay).toHaveBeenCalledWith(today);

    fireEvent.click(screen.getByRole("button", { name: "Back to today" }));
    expect(onSelectDay).toHaveBeenCalledWith(today);

    cleanup();
    const fromToday = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(fromToday.onSelectDay).toHaveBeenCalledWith(yesterday);
  });
});
