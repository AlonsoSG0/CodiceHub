import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HabitMatrix } from "./habit-matrix";
import type { Habit, HabitEntry } from "./habits-api";
import type { DayKey } from "./date";

// jsdom has no IntersectionObserver, and GraphHeatmap reveals its rows with `whileInView`.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const habit: Habit = {
  id: "reading",
  name: "Reading",
  icon: null,
  position: 0,
  section: "habits",
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  fields: [
    { id: "done", habitId: "reading", kind: "check", label: "Done", unit: null, target: null, position: 0, archivedAt: null },
  ],
};
const twoFieldHabit: Habit = {
  ...habit,
  fields: [
    ...habit.fields,
    { id: "pages", habitId: "reading", kind: "number", label: "Pages", unit: null, target: 10, position: 1, archivedAt: null },
  ],
};
const completed: HabitEntry = { habitId: "reading", fieldId: "done", date: "2026-02-03", kind: "check", value: true };
const props = (overrides: Partial<React.ComponentProps<typeof HabitMatrix>> = {}) => ({
  habits: [habit],
  entries: [completed],
  period: "month" as const,
  anchor: "2026-02-15",
  today: "2026-02-15" as DayKey,
  onPeriodChange: vi.fn(),
  onAnchorChange: vi.fn(),
  view: "mono" as const,
  onViewChange: vi.fn(),
  ...overrides,
});

function rowCells(label = "Reading"): HTMLElement[] {
  const row = screen.getByText(label).closest("li");
  if (!row) throw new Error(`missing heatmap row ${label}`);
  return [...row.querySelectorAll<HTMLElement>("[aria-hidden='true']")];
}

describe("HabitMatrix", () => {
  it("renders one column per month day and keeps history cells read-only", () => {
    render(<HabitMatrix {...props()} />);
    expect(rowCells()).toHaveLength(28);
    expect(rowCells()[2]?.textContent).toBe("█");
    expect(screen.getByRole("region", { name: "Scrollable habit history" })).toHaveClass("overflow-x-auto");
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /history.*2026-02-03/i })).not.toBeInTheDocument();
  });

  it("renders the level-2 glyph when one of two trackable fields is satisfied", () => {
    render(<HabitMatrix {...props({ habits: [twoFieldHabit], entries: [completed] })} />);
    expect(rowCells()[2]?.textContent).toBe("▒");
  });

  it("names only the first and every fifth day of a month", () => {
    render(<HabitMatrix {...props()} />);
    const headings = screen.getByText("Reading").closest("li")?.parentElement?.previousElementSibling;
    const labels = [...headings!.querySelectorAll("span")]
      .slice(1)
      .map((node) => node.textContent?.replace(/\u200b/g, ""));

    // February 2026 has 28 days, and one two-digit label per column truncates into noise at this width.
    expect(labels.filter((label) => label !== "")).toEqual(["1", "5", "10", "15", "20", "25"]);
  });

  it("renders 13 quarter columns and 52 year columns", () => {
    const { rerender } = render(<HabitMatrix {...props({ period: "quarter" })} />);
    expect(rowCells()).toHaveLength(13);
    rerender(<HabitMatrix {...props({ period: "year" })} />);
    expect(rowCells()).toHaveLength(52);
  });

  it("exposes pressed period buttons and updates the window caption", () => {
    const onPeriodChange = vi.fn();
    render(<HabitMatrix {...props({ onPeriodChange })} />);
    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Quarter" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("February 2026")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "Year" }));
    expect(onPeriodChange).toHaveBeenCalledWith("year");
  });

  it("moves the anchor by one period in either direction", () => {
    const onAnchorChange = vi.fn();
    render(<HabitMatrix {...props({ onAnchorChange })} />);
    fireEvent.click(screen.getByRole("button", { name: /next period/i }));
    fireEvent.click(screen.getByRole("button", { name: /previous period/i }));
    expect(onAnchorChange).toHaveBeenNthCalledWith(1, "2026-03-15");
    expect(onAnchorChange).toHaveBeenNthCalledWith(2, "2026-01-15");
  });

  it("labels only the weeks that contain the first of a month in a year", () => {
    render(<HabitMatrix {...props({ period: "year", anchor: "2026-06-15" })} />);
    const headings = screen.getByText("Reading").closest("li")?.parentElement?.previousElementSibling;
    expect(headings).toBeTruthy();
    const labels = [...headings!.querySelectorAll("span")].slice(1).map((node) => node.textContent);
    expect(labels).toHaveLength(52);
    // A trailing 52-week window holds 12 or 13 first-of-month weeks depending on where it starts.
    const named = labels.filter((label) => label?.replace(/\u200b/g, "") !== "").length;
    expect(named).toBeGreaterThanOrEqual(12);
    expect(named).toBeLessThanOrEqual(13);
  });

  it("averages a week in progress over the days that have already elapsed", () => {
    // 2026-06-15 is a Monday, so the last column of a year window is that week: two of its first three days are done.
    const elapsed: HabitEntry[] = [
      { habitId: "reading", fieldId: "done", date: "2026-06-15", kind: "check", value: true },
      { habitId: "reading", fieldId: "done", date: "2026-06-16", kind: "check", value: true },
    ];
    const { rerender } = render(
      <HabitMatrix {...props({ period: "year", anchor: "2026-06-15", today: "2026-06-17", entries: elapsed })} />,
    );

    // Two of the three days that have happened, not two of seven: the week is not punished for its remaining days.
    expect(rowCells().at(-1)?.textContent).toBe("▓");

    rerender(<HabitMatrix {...props({ period: "year", anchor: "2026-06-15", today: "2026-06-21", entries: elapsed })} />);
    // With the week over, the same two days are two of seven.
    expect(rowCells().at(-1)?.textContent).toBe("░");
  });

  it("switches to an activity heatmap from the same period data", () => {
    const onViewChange = vi.fn();
    const { rerender } = render(<HabitMatrix {...props({ onViewChange })} />);
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(onViewChange).toHaveBeenCalledWith("activity");
    rerender(<HabitMatrix {...props({ onViewChange, view: "activity" })} />);
    expect(screen.getByRole("list", { name: "Activity by day" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Feb 3, 2026: 1 of 1 habits completed/)).toBeInTheDocument();
    expect(screen.getByText("Less")).toBeInTheDocument();
  });

  it("keeps the matrix panel and period controls available with no active habits", () => {
    render(<HabitMatrix {...props({ habits: [] })} />);
    expect(screen.getByRole("button", { name: "Month" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /no habits/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Reading")).not.toBeInTheDocument();
  });
});
