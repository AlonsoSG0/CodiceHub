/* PROTOTYPE — the section's smoke test: the route component mounts, says its data is mocked, and its tabs switch. */

import { cleanup, fireEvent, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/app/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { todayKey } from "@/features/habits/date";
import { resetPreferenceCache } from "@/features/settings/preferences";
import { stubRoutineApi } from "./routine-fixture";
import { RoutinePage } from "./routine-page";

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={["/routine"]}>
          <RoutinePage />
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  resetPreferenceCache();
  stubRoutineApi(todayKey());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetPreferenceCache();
});

describe("RoutinePage", () => {
  it("opens as the guide with no prototype banner left behind", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Routine" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
  });

  it("surfaces a failed load as a toast with retry instead of a banner", async () => {
    const fixtureFetch = globalThis.fetch;
    let requests = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(input), "http://localhost").pathname === "/api/preferences") {
        return new Response(JSON.stringify({ preferences: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      requests += 1;
      if (requests < 3) {
        return new Response(JSON.stringify({ error: "unavailable", message: "Routine unavailable." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return fixtureFetch(input, init);
    });

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Routine unavailable.");
    expect(screen.getByRole("main").querySelector('[role="alert"]')).toBeNull();
    const firstToastRemoved = waitForElementToBeRemoved(alert);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await firstToastRemoved;
    const retryAlert = await screen.findByRole("alert");
    expect(retryAlert).toHaveTextContent("Routine unavailable.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
    expect(requests).toBe(3);
  });

  it("derives today from the stored workspace zone after the preference loads", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    const routineFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(input), "http://localhost").pathname === "/api/preferences") {
        return new Response(JSON.stringify({ preferences: { "workspace.timezone": "Pacific/Kiritimati" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return routineFetch(input, init);
    });

    renderPage();

    expect(await screen.findByText("Friday, January 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
  });

  it("switches from the guide to the week", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("tab", { name: "Week" }));

    expect(await screen.findByText("Weekly rate:", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches from the week to the builder", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("tab", { name: "Build" }));

    expect(await screen.findByRole("region", { name: "Build the routine" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Build" })).toHaveAttribute("aria-selected", "true");
  });
});
