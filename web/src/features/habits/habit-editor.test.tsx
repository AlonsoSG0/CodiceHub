import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Habit } from "./habits-api";
import { HabitEditor } from "./habit-editor";

afterEach(cleanup);

const day = "2025-03-08";

function makeHabit(fields: Habit["fields"] = []): Habit {
  return {
    id: "habit-1",
    name: "Reading",
    icon: "book-open",
    position: 0,
    section: "habits",
    archivedAt: null,
    createdAt: day,
    updatedAt: day,
    fields,
  };
}

function makeField(kind: "check" | "number" | "text", overrides: Partial<Habit["fields"][number]> = {}) {
  return {
    id: `field-${kind}`,
    habitId: "habit-1",
    kind,
    label: kind === "check" ? "Done" : kind === "number" ? "Pages" : "Note",
    unit: kind === "number" ? "pages" : null,
    target: kind === "number" ? 30 : null,
    position: 0,
    archivedAt: null,
    ...overrides,
  };
}

function renderEditor(overrides: Partial<React.ComponentProps<typeof HabitEditor>> = {}) {
  return render(
    <HabitEditor
      habit={makeHabit([makeField("number")])}
      onRename={vi.fn().mockResolvedValue(undefined)}
      onUpdateIcon={vi.fn().mockResolvedValue(undefined)}
      onAddField={vi.fn().mockResolvedValue(undefined)}
      onUpdateField={vi.fn().mockResolvedValue(undefined)}
      onRemoveField={vi.fn().mockResolvedValue("deleted")}
      onArchive={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

async function chooseOption(label: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  const option = await screen.findByRole("option", { name: optionName });
  fireEvent.pointerDown(option, { button: 0, pointerType: "mouse" });
  fireEvent.pointerUp(option, { button: 0, pointerType: "mouse" });
  fireEvent.click(option);
}

describe("HabitEditor", () => {
  it("locks the name and archive controls for a Books-managed habit", () => {
    const onRename = vi.fn();
    const onArchive = vi.fn();
    renderEditor({ managedByBooks: true, onRename, onArchive });
    const name = screen.getByRole("textbox", { name: "Habit name" });
    const archive = screen.getByRole("button", { name: "Archive habit" });
    expect(name).toHaveAttribute("readonly");
    expect(archive).toBeDisabled();
    expect(screen.getByText("This habit is managed by Books.")).toBeVisible();
    fireEvent.change(name, { target: { value: "Changed" } });
    fireEvent.keyDown(name, { key: "Enter" });
    fireEvent.blur(name);
    fireEvent.click(archive);
    expect(onRename).not.toHaveBeenCalled();
    expect(onArchive).not.toHaveBeenCalled();
  });
  it("groups identity, fields, add-field controls, and archive in named settings sections", () => {
    renderEditor();

    expect(screen.getByRole("heading", { name: "Identity" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fields" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add field" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Habit name" })).toHaveValue("Reading");
    expect(screen.getByRole("combobox", { name: "Habit icon" })).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Existing field kind" })).not.toBeInTheDocument();
  });

  it("commits the name on blur and updates the selected icon", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onUpdateIcon = vi.fn().mockResolvedValue(undefined);
    renderEditor({ onRename, onUpdateIcon });
    const input = screen.getByRole("textbox", { name: "Habit name" });

    fireEvent.change(input, { target: { value: "Morning reading" } });
    expect(onRename).not.toHaveBeenCalled();
    fireEvent.blur(input);
    await waitFor(() => expect(onRename).toHaveBeenCalledWith("Morning reading"));

    await chooseOption("Habit icon", "Strength");
    expect(onUpdateIcon).toHaveBeenCalledWith("dumbbell");
  });

  it("adds a number field with its unit and target", async () => {
    const onAddField = vi.fn().mockResolvedValue(undefined);
    renderEditor({ habit: makeHabit([]), onAddField });

    await chooseOption("Field kind", "Number");
    fireEvent.change(screen.getByRole("textbox", { name: "New field label" }), { target: { value: "Focus time" } });
    fireEvent.change(screen.getByRole("textbox", { name: "New field unit" }), { target: { value: "min" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "New field target" }), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));

    await waitFor(() =>
      expect(onAddField).toHaveBeenCalledWith({ kind: "number", label: "Focus time", unit: "min", target: 30 }),
    );
  });

  it("updates field label, unit, and target and reports when an entry-bearing field is archived", async () => {
    const onUpdateField = vi.fn().mockResolvedValue(undefined);
    const onRemoveField = vi.fn().mockResolvedValue("archived");
    renderEditor({ onUpdateField, onRemoveField });
    const fieldRow = screen.getByRole("textbox", { name: "Pages label" }).closest("li");
    expect(fieldRow).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Pages label" }), { target: { value: "Books" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Pages label" }));
    await waitFor(() => expect(onUpdateField).toHaveBeenCalledWith("field-number", { label: "Books" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Pages unit" }), { target: { value: "books" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Pages unit" }));
    await waitFor(() => expect(onUpdateField).toHaveBeenCalledWith("field-number", { unit: "books" }));

    fireEvent.change(screen.getByRole("spinbutton", { name: "Pages target" }), { target: { value: "12" } });
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Pages target" }), { key: "Enter", code: "Enter" });
    await waitFor(() => expect(onUpdateField).toHaveBeenCalledWith("field-number", { target: 12 }));

    fireEvent.click(within(fieldRow!).getByRole("button", { name: "Remove Pages" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Pages had entries and was archived.");
  });

  it("keeps an error inside the settings dialog and leaves the form usable", async () => {
    const onRename = vi.fn().mockRejectedValueOnce(new Error("Could not save habit")).mockResolvedValue(undefined);
    renderEditor({ onRename });
    const input = screen.getByRole("textbox", { name: "Habit name" });
    fireEvent.change(input, { target: { value: "First attempt" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save habit");
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Second attempt" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(onRename).toHaveBeenLastCalledWith("Second attempt"));
  });
});
