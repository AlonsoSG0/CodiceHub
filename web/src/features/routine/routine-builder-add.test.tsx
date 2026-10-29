/* Reproduction for the reported "Add block does nothing" defect. */
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

describe("Add block", () => {
  it("creates a block from the add form with its default times", async () => {
    render(<BuilderHarness />);
    await screen.findByRole("button", { name: "Add block" });
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));

    fireEvent.change(await screen.findByLabelText("New block title"), { target: { value: "Morning walk" } });
    fireEvent.click(screen.getByRole("button", { name: /Add block/ }));

    await waitFor(() => {
      expect(within(screen.getByRole("complementary", { name: /day overview/ })).getByText("Morning walk")).toBeInTheDocument();
    });
  });

  it("leaves the constructor empty and creates nothing when the day is fully booked", async () => {
    render(<BuilderHarness />);

    await screen.findAllByText("No further slot fits in this day's waking window.");
    expect(screen.getByLabelText("New block start time")).toHaveValue("");
    expect(screen.getByLabelText("New block end time")).toHaveValue("");
    expect(within(screen.getByRole("complementary", { name: /day overview/ })).getAllByRole("listitem")).toHaveLength(11);
  });
});
