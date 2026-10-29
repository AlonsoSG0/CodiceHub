import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DayKey } from "./date";
import type { Habit, HabitEntry } from "./habits-api";
import { TodayStrip } from "./today-strip";

afterEach(cleanup);

const day = "2025-03-08" as DayKey;

function makeHabit(fields: Habit["fields"]): Habit {
  return {
    id: "habit-1",
    name: "Reading",
    icon: null,
    position: 0,
    section: "habits",
    archivedAt: null,
    createdAt: day,
    updatedAt: day,
    fields,
  };
}

function makeField(
  kind: "check" | "number" | "text",
  overrides: Partial<Habit["fields"][number]> = {},
): Habit["fields"][number] {
  return {
    id: `field-${kind}`,
    habitId: "habit-1",
    kind,
    label: kind === "check" ? "Done" : kind === "number" ? "Pages" : "Note",
    unit: kind === "number" ? "pages" : null,
    target: null,
    position: 0,
    archivedAt: null,
    ...overrides,
  };
}

function makeEntry(kind: HabitEntry["kind"], value: HabitEntry["value"]): HabitEntry {
  return { habitId: "habit-1", fieldId: `field-${kind}`, date: day, kind, value };
}

describe("TodayStrip", () => {
  it("renders the selected date in each checkbox name and starts from saved entries", () => {
    render(
      <TodayStrip
        habits={[makeHabit([makeField("check")])]}
        entries={[makeEntry("check", true)]}
        day={day}
        today={day}
        onSetValues={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Reading Done 2025-03-08" })).toHaveAttribute("aria-checked", "true");
  });

  it("optimistically toggles and sends the new value", async () => {
    const onSetValues = vi.fn().mockResolvedValue(undefined);
    render(<TodayStrip habits={[makeHabit([makeField("check")])]} entries={[]} day={day} today={day} onSetValues={onSetValues} />);

    const check = screen.getByRole("checkbox", { name: "Reading Done 2025-03-08" });
    fireEvent.click(check);

    expect(check).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(onSetValues).toHaveBeenCalledWith("habit-1", "2025-03-08", [{ fieldId: "field-check", value: true }]));
  });

  it("sends null when unticking", async () => {
    const onSetValues = vi.fn().mockResolvedValue(undefined);
    render(
      <TodayStrip
        habits={[makeHabit([makeField("check")])]}
        entries={[makeEntry("check", true)]}
        day={day}
        today={day}
        onSetValues={onSetValues}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Reading Done 2025-03-08" }));
    await waitFor(() => expect(onSetValues).toHaveBeenCalledWith("habit-1", "2025-03-08", [{ fieldId: "field-check", value: null }]));
  });

  it("reverts a rejected check and shows a visible alert", async () => {
    const onSetValues = vi.fn().mockRejectedValue(new Error("Could not save check-in"));
    render(
      <TodayStrip habits={[makeHabit([makeField("check")])]} entries={[]} day={day} today={day} onSetValues={onSetValues} />,
    );

    const check = screen.getByRole("checkbox", { name: "Reading Done 2025-03-08" });
    fireEvent.click(check);
    expect(check).toHaveAttribute("aria-checked", "true");

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save check-in");
    expect(check).toHaveAttribute("aria-checked", "false");
  });

  it("commits a number on blur and Enter without writing while typing", async () => {
    const onSetValues = vi.fn().mockResolvedValue(undefined);
    const numberField = makeField("number", { target: 30, unit: "min" });
    render(
      <TodayStrip
        habits={[makeHabit([numberField])]}
        entries={[makeEntry("number", 12)]}
        day={day}
        today={day}
        onSetValues={onSetValues}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "Reading Pages 2025-03-08" });
    expect(screen.getByText("12 / 30 min")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "18" } });
    expect(onSetValues).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() =>
      expect(onSetValues).toHaveBeenCalledWith("habit-1", "2025-03-08", [{ fieldId: "field-number", value: 18 }]),
    );

    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onSetValues).toHaveBeenLastCalledWith("habit-1", "2025-03-08", [{ fieldId: "field-number", value: 20 }]));
  });

  it("reveals text notes progressively and commits the note on Enter", async () => {
    const onSetValues = vi.fn().mockResolvedValue(undefined);
    render(
      <TodayStrip
        habits={[makeHabit([makeField("text")])]}
        entries={[]}
        day={day}
        today={day}
        onSetValues={onSetValues}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "Reading Note 2025-03-08" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add note for Reading" }));
    const input = screen.getByRole("textbox", { name: "Reading Note 2025-03-08" });
    fireEvent.change(input, { target: { value: "A useful note" } });
    expect(onSetValues).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() =>
      expect(onSetValues).toHaveBeenCalledWith("habit-1", "2025-03-08", [{ fieldId: "field-text", value: "A useful note" }]),
    );
  });

  it("shows the completed-field count without treating notes as completion fields", () => {
    const check = makeField("check");
    const number = makeField("number", { target: 10 });
    const secondCheck = makeField("check", { id: "field-second-check", label: "Stretch", position: 2 });
    const note = makeField("text", { id: "field-note", position: 3 });
    render(
      <TodayStrip
        habits={[makeHabit([check, number, secondCheck, note])]}
        entries={[makeEntry("check", true), makeEntry("number", 12)]}
        day={day}
        today={day}
        onSetValues={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Reading Done 2025-03-08" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Reading Pages 2025-03-08" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add note for Reading" })).toBeInTheDocument();
  });
});
