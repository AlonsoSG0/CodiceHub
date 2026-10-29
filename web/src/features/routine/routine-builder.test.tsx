import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayKey } from "@/features/habits/date";
import { ToastProvider } from "@/components/ui/toast";
import { stubRoutineApi } from "./routine-fixture";
import { useRoutineStore } from "./use-routine";
import { RoutineBuilder } from "./routine-builder";

function BuilderHarness() {
  const store = useRoutineStore();
  return <ToastProvider>{store.state === null ? null : <RoutineBuilder store={store} />}</ToastProvider>;
}

beforeEach(() => {
  stubRoutineApi(todayKey());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RoutineBuilder", () => {
  it("puts the constructor before programmed blocks and numbers the day in start order", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));

    const addForm = screen.getByRole("button", { name: "Add block" }).closest("form")!;
    const timeline = screen.getByRole("list", { name: "Monday timeline" });
    expect(addForm.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(addForm).getByRole("heading", { name: /Add a block/ })).toHaveTextContent("#2");

    const overview = within(screen.getByRole("complementary", { name: "Monday day overview" }));
    const numberedBlocks = overview.getAllByRole("listitem");
    expect(numberedBlocks[0]).toHaveTextContent("1.Stretch");
    expect(numberedBlocks[1]).toHaveTextContent("2.Wake up and breakfast");
    expect(numberedBlocks[2]).toHaveTextContent("3.Read");
  });

  it("moves block ordinals when a block is moved to another position in the day", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));

    const dentistTitle = await screen.findByDisplayValue("Dentist");
    const dentistRow = dentistTitle.closest("li")!;
    fireEvent.change(within(dentistRow).getByLabelText("Start time"), { target: { value: "20:00" } });
    fireEvent.change(within(dentistRow).getByLabelText("End time"), { target: { value: "20:15" } });
    fireEvent.click(within(dentistRow).getByRole("button", { name: "Save block" }));

    const timeline = within(screen.getByRole("list", { name: "Wednesday timeline" }));
    await waitFor(() => {
      expect(within(timeline.getByDisplayValue("Dinner").closest("li")!).getByLabelText("Block title").parentElement).toHaveTextContent("Block 7");
      expect(within(timeline.getByDisplayValue("Dentist").closest("li")!).getByLabelText("Block title").parentElement).toHaveTextContent("Block 8");
      expect(within(timeline.getByDisplayValue("Wind down").closest("li")!).getByLabelText("Block title").parentElement).toHaveTextContent("Block 9");
    });
  });

  it("repeats the selected day across the week and keeps its template badge", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });

    fireEvent.click(screen.getByRole("button", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("button", { name: "Repeat this day across the week" }));

    await waitFor(() => expect(screen.getByText("Template day")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    expect(await screen.findByDisplayValue("Wake up and breakfast")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Dentist")).not.toBeInTheDocument();
  });

  it("round-trips the editable-history setting through the settings API", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    const setting = screen.getByRole("combobox", { name: "Editable history" });

    fireEvent.change(setting, { target: { value: "3" } });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Editable history" })).toHaveValue("3"));
    fireEvent.change(screen.getByRole("combobox", { name: "Editable history" }), { target: { value: "7" } });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Editable history" })).toHaveValue("7"));
  });

  it("shows a weekday name in the week-start trigger", async () => {
    render(<BuilderHarness />);
    const trigger = await screen.findByRole("combobox", { name: "Week starts on" });
    expect(trigger).toHaveTextContent("Monday");
    expect(trigger).not.toHaveTextContent("1");
  });

  it("applies a newly created window to exactly its selected weekdays", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });

    fireEvent.click(screen.getByRole("button", { name: "Add window" }));
    const dayPicker = within(screen.getByRole("group", { name: "Choose weekdays for this window" }));
    fireEvent.click(dayPicker.getByRole("button", { name: "Tuesday" }));
    fireEvent.click(dayPicker.getByRole("button", { name: "Thursday" }));
    fireEvent.change(screen.getByLabelText("Window start"), { target: { value: "06:00" } });
    fireEvent.change(screen.getByLabelText("Window end"), { target: { value: "22:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save window" }));

    expect(await screen.findByText("Tuesday · Thursday: 06:00–22:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Sunday: 07:00–23:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Monday: 07:00–23:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Wednesday: 07:00–23:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Friday: 07:00–23:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Saturday: 07:00–23:00")).toBeInTheDocument();
  });

  it("announces the ordinal that a created block receives", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    await screen.findByRole("heading", { name: "Wednesday" });

    const constructor = screen.getByRole("button", { name: "Add block" }).closest("form")!;
    fireEvent.change(within(constructor).getByLabelText("New block start time"), { target: { value: "17:00" } });
    fireEvent.change(within(constructor).getByLabelText("New block end time"), { target: { value: "18:00" } });
    const announcedOrdinal = Number(within(constructor).getByRole("heading", { name: /Add a block/ }).textContent?.match(/#(\d+)/)?.[1]);
    fireEvent.change(within(constructor).getByLabelText("New block title"), { target: { value: "Ordinal proof" } });
    fireEvent.click(within(constructor).getByRole("button", { name: "Add block" }));

    await waitFor(() => {
      const createdRow = screen.getAllByLabelText("Block title").find((input) => (input as HTMLInputElement).value === "Ordinal proof")?.closest("li");
      expect(createdRow).not.toBeNull();
      expect(within(createdRow!).getByLabelText("Block title").parentElement).toHaveTextContent(`Block ${announcedOrdinal}`);
    });
  });

  it("primes the next block start at the previous block end after saving", async () => {
    render(<BuilderHarness />);
    await screen.findByLabelText("New block title");
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    fireEvent.change(screen.getByLabelText("New block title"), { target: { value: "New focus block" } });
    fireEvent.change(screen.getByLabelText("New block start time"), { target: { value: "17:00" } });
    fireEvent.change(screen.getByLabelText("New block end time"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));

    await waitFor(() => expect(screen.getByLabelText("New block start time")).toHaveValue("18:00"));
  });

  it("does not prime an unusable slot after a block near the end of the day", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.change(screen.getByLabelText("Day ends"), { target: { value: "23:40" } });
    await waitFor(() => expect(screen.getByLabelText("Day ends")).toHaveValue("23:40"));
    fireEvent.click(screen.getByRole("button", { name: "Sunday" }));
    fireEvent.change(screen.getByLabelText("New block title"), { target: { value: "Late block" } });
    fireEvent.change(screen.getByLabelText("New block start time"), { target: { value: "22:30" } });
    fireEvent.change(screen.getByLabelText("New block end time"), { target: { value: "23:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));

    expect(await screen.findByDisplayValue("Late block")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("New block start time")).not.toHaveValue("23:30"));
    expect(screen.getByLabelText("New block start time")).toHaveValue("");
    expect(screen.getByLabelText("New block end time")).toHaveValue("");
    expect(screen.getAllByText("No further slot fits in this day's waking window.").length).toBeGreaterThan(0);
  });

  it("advances Next from the current draft start and never moves backwards", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    await screen.findByRole("heading", { name: "Wednesday" });
    fireEvent.change(screen.getByLabelText("New block start time"), { target: { value: "16:00" } });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByLabelText("New block start time")).toHaveValue("17:00");
    expect(screen.getByLabelText("New block start time")).not.toHaveValue("07:00");
  });

  it("shows the no-further-slot message beside Next when no slot fits", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    await screen.findByRole("heading", { name: "Monday" });
    const nextButton = screen.getByRole("button", { name: "Next" });

    fireEvent.change(screen.getByLabelText("New block start time"), { target: { value: "22:45" } });
    fireEvent.click(nextButton);

    await waitFor(() => expect(within(nextButton.parentElement!.parentElement!).getByText("No further slot fits in this day's waking window.")).toBeInTheDocument());
  });

  it("reports emptied waking-window times and preserves their last valid value", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.change(screen.getByLabelText("Day starts"), { target: { value: "" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Window needs a valid time");
    expect(screen.getByLabelText("Day starts")).toHaveValue("07:00");
  });

  it("reports emptied edited-window times and keeps the last valid value", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.click(screen.getByRole("button", { name: "Add window" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Choose weekdays for this window" })).getByRole("button", { name: "Tuesday" }));
    fireEvent.change(screen.getByLabelText("Window start"), { target: { value: "06:00" } });
    fireEvent.change(screen.getByLabelText("Window end"), { target: { value: "22:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save window" }));
    const windowRow = (await screen.findAllByText("Tuesday: 06:00–22:00"))[0]!;
    fireEvent.click(within(windowRow.parentElement!).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit window start"), { target: { value: "" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Window needs a valid time");
    expect(screen.getByLabelText("Edit window start")).toHaveValue("06:00");
    expect(screen.getByLabelText("Edit window end")).toHaveValue("22:00");
  });

  it("identifies an orphan link and lets the user clear it", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));

    expect(await screen.findByText("Unavailable habit")).toBeInTheDocument();
    const stretchTitle = await screen.findByDisplayValue("Stretch");
    const stretchRow = stretchTitle.closest("li");
    expect(stretchRow).not.toBeNull();
    const linkSelect = within(stretchRow!).getByRole("combobox", { name: "Block link" });
    fireEvent.click(linkSelect);
    expect(screen.queryByRole("option", { name: /habit-stretch/i })).not.toBeInTheDocument();
    const noLinkOption = screen.getByRole("option", { name: "No link" });
    fireEvent.click(noLinkOption);
    const refreshedStretchRow = (await screen.findByDisplayValue("Stretch")).closest("li")!;
    await waitFor(() => expect(within(refreshedStretchRow).getByRole("combobox", { name: "Block link" })).toHaveTextContent("No link"));
    fireEvent.click(within((await screen.findByDisplayValue("Stretch")).closest("li")!).getByRole("button", { name: "Save block" }));
    await waitFor(() => expect(screen.queryByText("Unavailable habit")).not.toBeInTheDocument());
  });

  it("returns a deleted window's weekdays to the base window only", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Repeat this day across the week" });
    fireEvent.click(screen.getByRole("button", { name: "Add window" }));
    const dayPicker = within(screen.getByRole("group", { name: "Choose weekdays for this window" }));
    fireEvent.click(dayPicker.getByRole("button", { name: "Tuesday" }));
    fireEvent.click(dayPicker.getByRole("button", { name: "Thursday" }));
    fireEvent.change(screen.getByLabelText("Window start"), { target: { value: "06:00" } });
    fireEvent.change(screen.getByLabelText("Window end"), { target: { value: "22:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save window" }));
    await screen.findByText("Tuesday · Thursday: 06:00–22:00");
    fireEvent.click(screen.getByRole("button", { name: "Add window" }));
    const secondDayPicker = within(screen.getByRole("group", { name: "Choose weekdays for this window" }));
    fireEvent.click(secondDayPicker.getByRole("button", { name: "Friday" }));
    fireEvent.change(screen.getByLabelText("Window start"), { target: { value: "06:30" } });
    fireEvent.change(screen.getByLabelText("Window end"), { target: { value: "21:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save window" }));
    expect((await screen.findAllByText("Friday: 06:30–21:30")).length).toBeGreaterThan(0);

    fireEvent.click(within(screen.getByRole("region", { name: "Routine settings" })).getAllByRole("button", { name: /^Delete$/ })[0]!);

    await waitFor(() => {
      expect(screen.getByLabelText("Tuesday: 07:00–23:00")).toBeInTheDocument();
      expect(screen.getByLabelText("Thursday: 07:00–23:00")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Sunday: 07:00–23:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Monday: 07:00–23:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Wednesday: 07:00–23:00")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Resolved weekday windows")).getByLabelText("Friday: 06:30–21:30")).toBeInTheDocument();
    expect(screen.getByLabelText("Saturday: 07:00–23:00")).toBeInTheDocument();
  });

  it("announces a rejected overlap as a toast and writes nothing", async () => {
    render(<BuilderHarness />);
    const wakeUpTitle = await screen.findByDisplayValue("Wake up and breakfast");
    const wakeUpRow = wakeUpTitle.closest("li");
    expect(wakeUpRow).not.toBeNull();

    fireEvent.change(wakeUpRow!.querySelector('input[aria-label="End time"]')!, { target: { value: "08:15" } });
    fireEvent.click(wakeUpRow!.querySelector('button[aria-label="Save block"]')!);

    expect(await screen.findByRole("alert")).toHaveTextContent('"Read" already runs 08:00-08:30.');
    fireEvent.click(screen.getByRole("button", { name: "Sunday" }));
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    const reloadedWakeUpRow = (await screen.findByDisplayValue("Wake up and breakfast")).closest("li");
    expect(reloadedWakeUpRow?.querySelector<HTMLInputElement>('input[aria-label="End time"]')).toHaveValue("08:00");
  });
});
