import { cleanup, fireEvent, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./toast";

function ToastTrigger() {
  const toast = useToast();

  return (
    <button
      type="button"
      onClick={() =>
        toast({
          tone: "error",
          title: "Could not save",
          description: "Try again.",
          actions: [
            { label: "Retry", onClick: () => undefined },
            { label: "Dismiss", onClick: () => undefined },
          ],
        })
      }
    >
      Show toast
    </button>
  );
}

afterEach(cleanup);

describe("toast", () => {
  it("announces errors, renders actions, and dismisses with Escape", async () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show toast" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not save");
    expect(alert).toHaveTextContent("Try again.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();

    const removed = waitForElementToBeRemoved(() => screen.getByRole("alert"));
    fireEvent.keyDown(document, { key: "Escape" });
    await removed;
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces non-error tones as status", () => {
    function InfoTrigger() {
      const toast = useToast();
      return <button onClick={() => toast({ tone: "success", title: "Saved" })}>Save</button>;
    }

    render(<ToastProvider><InfoTrigger /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
