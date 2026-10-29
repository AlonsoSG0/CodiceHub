import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { todayKey } from "./date";
import type { Habit, HabitEntry } from "./habits-api";
import { HabitsPage } from "./habits-page";
import { ThemeProvider } from "@/app/theme-provider";
import { MemoryRouter } from "react-router-dom";
import { resetPreferenceCache } from "@/features/settings/preferences";

// jsdom has no IntersectionObserver, and the vendored heatmap reveals its rows with `whileInView`.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

const today = todayKey();

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
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
    ...overrides,
  };
}

const doneToday: HabitEntry = { habitId: "reading", fieldId: "done", date: today, kind: "check", value: true };

/** A tiny in-memory server so the page exercises the real client against real request shapes. */
function stubServer(options: { createFails?: boolean; empty?: boolean; failFirstLoad?: boolean; extra?: Habit[]; readingHabitLinked?: boolean } = {}) {
  const active: Habit[] = [...(options.empty ? [] : [makeHabit()]), ...(options.extra ?? [])];
  const archived: Habit[] = [];
  const entries: HabitEntry[] = [doneToday];
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  let failedLoad = false;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ url, method, body });

      if (url === "/api/preferences") return json({ preferences: options.readingHabitLinked === undefined ? {} : { "modules.readingHabitLinked": options.readingHabitLinked } });
      if (url.startsWith("/api/habits/entries?")) return json({ entries });
      if (url.includes("archived=1")) return json({ habits: archived });
      if (url.startsWith("/api/habits") && method === "GET") {
        if (options.failFirstLoad && !failedLoad) {
          failedLoad = true;
          return json({ error: "offline" }, 500);
        }
        return json({ habits: active });
      }

      if (url === "/api/habits" && method === "POST") {
        if (options.createFails) return json({ error: "invalid_name" }, 400);
        const input = JSON.parse(body ?? "{}") as { name: string; icon: string };
        const created = makeHabit({
          id: "gym",
          name: input.name,
          icon: input.icon,
          position: 1,
          fields: [{ id: "gym-done", habitId: "gym", kind: "check", label: "Done", unit: null, target: null, position: 0, archivedAt: null }],
        });
        active.push(created);
        return json(created, 201);
      }

      if (url.endsWith("/purge")) {
        const id = url.split("/")[3]!;
        archived.splice(archived.findIndex((habit) => habit.id === id), 1);
        return json({ purged: [id] });
      }

      if (method === "PATCH") {
        const id = url.split("/")[3]!;
        const patch = JSON.parse(body ?? "{}") as { archived?: boolean; name?: string; icon?: string | null };
        const source = [...active, ...archived].find((habit) => habit.id === id)!;
        const next = {
          ...source,
          ...patch,
          archivedAt: patch.archived === true ? "2026-02-01T00:00:00.000Z" : patch.archived === false ? null : source.archivedAt,
        };
        active.splice(active.findIndex((habit) => habit.id === id), 1);
        archived.splice(archived.findIndex((habit) => habit.id === id), 1);
        (next.archivedAt === null ? active : archived).push(next);
        return json(next);
      }

      if (method === "PUT" && url.includes("/entries/")) {
        const habitId = url.split("/")[3]!;
        const date = decodeURIComponent(url.split("/").at(-1)!) as HabitEntry["date"];
        const values = (JSON.parse(body ?? "{}") as { values: Array<{ fieldId: string; value: boolean | number | string | null }> }).values;
        for (const { fieldId, value } of values) {
          const index = entries.findIndex((entry) => entry.fieldId === fieldId && entry.date === date);
          if (index >= 0) entries.splice(index, 1);
          if (value !== null) {
            const field = [...active, ...archived].find((habit) => habit.id === habitId)?.fields.find((candidate) => candidate.id === fieldId);
            entries.push({ habitId, fieldId, date, kind: field?.kind ?? "check", value });
          }
        }
        return json({ entries: entries.filter((entry) => entry.habitId === habitId && entry.date === date) });
      }

      throw new Error(`unexpected request: ${method} ${url}`);
    }),
  );

  return { active, archived, entries, calls };
}

beforeEach(() => {
  resetPreferenceCache();
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

describe("HabitsPage", () => {
  it("shows the workspace summary, today panel, and read-only matrix", async () => {
    stubServer();
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);

    expect(await screen.findByRole("checkbox", { name: `Reading Done ${today}` })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("heading", { name: "Habits" })).toBeInTheDocument();
    expect(screen.getByText("Today", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Consistency" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Today check-ins" })).toBeInTheDocument();
    expect(screen.getByText("All habits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reading habit settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reading:.*2026/ })).not.toBeInTheDocument();
  });

  it("lists the books-section reading habit as one more habit", async () => {
    // The reading habit Books maintains lives in the books section; /habits lists every section, so it is
    // recorded from either surface and the entries are the same.
    const reading = makeHabit({
      id: "reading-books",
      name: "Reading",
      section: "books",
      position: 1,
      fields: [{ id: "reading-done", habitId: "reading-books", kind: "check", label: "Done", unit: null, target: null, position: 0, archivedAt: null }],
    });
    stubServer({ empty: true, extra: [reading] });
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);

    expect(await screen.findByRole("checkbox", { name: `Reading Done ${today}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reading habit settings" })).toBeInTheDocument();
  });

  it("hides books-section habits when the workspace preference is off", async () => {
    const reading = makeHabit({ id: "reading-books", name: "Books reading", section: "books" });
    const server = stubServer({ extra: [reading], readingHabitLinked: false });
    server.archived.push(makeHabit({ id: "archived-books", name: "Archived books reading", section: "books", archivedAt: "2026-02-01" }));
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    expect(await screen.findByRole("button", { name: "Reading habit settings" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Books reading habit settings" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /archived habits/i }));
    expect(await screen.findByText("Nothing is archived yet.")).toBeInTheDocument();
    expect(screen.queryByText("Archived books reading")).not.toBeInTheDocument();
  });

  it("gives both dialog close controls a 44-pixel touch target", async () => {
    stubServer();
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    await screen.findByRole("button", { name: "Reading habit settings" });

    fireEvent.click(screen.getByRole("button", { name: "New habit" }));
    expect(await screen.findByRole("button", { name: "Close new habit dialog" })).toHaveClass("size-11");
    fireEvent.click(screen.getByRole("button", { name: "Close new habit dialog" }));

    fireEvent.click(screen.getByRole("button", { name: "Reading habit settings" }));
    expect(await screen.findByRole("button", { name: "Close habit settings" })).toHaveClass("size-11");
  });

  it("creates a habit with its icon and initial check field, then shows it in Today and history", async () => {
    const server = stubServer();
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    await screen.findByRole("checkbox", { name: `Reading Done ${today}` });

    fireEvent.click(screen.getByRole("button", { name: "New habit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Habit name" }), { target: { value: "Gym" } });
    fireEvent.click(screen.getByRole("button", { name: "Create habit" }));

    expect(await screen.findByRole("checkbox", { name: `Gym Done ${today}` })).toBeInTheDocument();
    const createCall = server.calls.find(({ method, url }) => method === "POST" && url === "/api/habits");
    expect(JSON.parse(createCall?.body ?? "{}")).toMatchObject({ name: "Gym", icon: "circle" });
    expect(server.active[1]?.fields).toHaveLength(1);
    expect(server.active[1]?.fields[0]).toMatchObject({ kind: "check", label: "Done" });
    expect(server.active.map(({ name }) => name)).toEqual(["Reading", "Gym"]);
  });

  it("updates the loaded history after a successful check without refetching", async () => {
    const server = stubServer();
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    const check = await screen.findByRole("checkbox", { name: `Reading Done ${today}` });
    const entryReads = server.calls.filter(({ url }) => url.startsWith("/api/habits/entries")).length;

    fireEvent.click(check);

    await waitFor(() => expect(check).toHaveAttribute("aria-checked", "false"));
    expect(server.calls.filter(({ url }) => url.startsWith("/api/habits/entries")).length).toBe(entryReads);
    expect(server.entries).toHaveLength(0);
  });

  it("never asks the API for a day that has not happened yet", async () => {
    // The habits view opens on a whole month, and the server refuses a day beyond today, so a range that reached
    // into the future would fail the entire load with invalid_date.
    const server = stubServer();
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    await screen.findByRole("checkbox", { name: `Reading Done ${today}` });

    const read = server.calls.find(({ url }) => url.startsWith("/api/habits/entries"))!;
    const query = new URLSearchParams(read.url.slice(read.url.indexOf("?")));
    expect(query.get("from")! <= today).toBe(true);
    expect(query.get("to")! <= today).toBe(true);
  });

  it("shows the failure instead of pretending the write worked", async () => {
    stubServer({ createFails: true });
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    await screen.findByRole("checkbox", { name: `Reading Done ${today}` });

    fireEvent.click(screen.getByRole("button", { name: "New habit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Habit name" }), { target: { value: "Gym" } });
    fireEvent.click(screen.getByRole("button", { name: "Create habit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid_name");
    expect(screen.queryByRole("checkbox", { name: `Gym Done ${today}` })).not.toBeInTheDocument();
  });

  it("archives from settings into the archived disclosure without deleting history", async () => {
    const server = stubServer();
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    await screen.findByRole("button", { name: "Reading habit settings" });
    fireEvent.click(screen.getByRole("button", { name: "Reading habit settings" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /archive habit/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await waitFor(() => expect(screen.queryByRole("checkbox", { name: `Reading Done ${today}` })).not.toBeInTheDocument());
    expect(server.entries).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /archived habits/i }));
    expect(await screen.findByRole("button", { name: "Restore Reading" })).toBeInTheDocument();
  });

  it("restores an archived habit back into the strip", async () => {
    stubServer();
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    await screen.findByRole("button", { name: "Reading habit settings" });
    fireEvent.click(screen.getByRole("button", { name: "Reading habit settings" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /archive habit/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /archived habits/i }));

    fireEvent.click(await screen.findByRole("button", { name: "Restore Reading" }));

    expect(await screen.findByRole("checkbox", { name: `Reading Done ${today}` })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "Restore Reading" })).not.toBeInTheDocument();
  });

  it("deletes an archived habit forever only on the second click", async () => {
    const server = stubServer();
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    await screen.findByRole("button", { name: "Reading habit settings" });
    fireEvent.click(screen.getByRole("button", { name: "Reading habit settings" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /archive habit/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /archived habits/i }));
    await screen.findByRole("button", { name: "Delete permanently" });

    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    // The first click only arms the delete, so a mis-click can never destroy the history.
    expect(server.calls.some(({ url }) => url.endsWith("/purge"))).toBe(false);
    expect(await screen.findByRole("button", { name: /confirm permanent deletion/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirm permanent deletion/i }));

    await waitFor(() => expect(server.archived).toHaveLength(0));
    expect(server.calls.some(({ url }) => url.endsWith("/purge"))).toBe(true);
  });

  it("shows and recovers from loading, empty, and load failure states", async () => {
    const server = stubServer({ empty: true });
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    expect(screen.getByRole("status", { name: "Loading habits" })).toBeInTheDocument();
    expect(await screen.findByText(/No habits yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /archived habits/i }));
    expect(await screen.findByText("Nothing is archived yet.")).toBeInTheDocument();
    cleanup();

    stubServer({ failFirstLoad: true });
    render(<ThemeProvider><MemoryRouter><HabitsPage /></MemoryRouter></ThemeProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Reading habit settings" })).toBeInTheDocument();
    expect(server.active).toHaveLength(0);
  });
});
