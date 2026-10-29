import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/app/theme-provider";
import { useT } from "@/i18n";
import { GoalsPage } from "./goals-page";

const now = "2026-10-23T00:00:00.000Z";

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(JSON.stringify(body)),
  } as Response;
}

function group(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "Personal",
    position: 0,
    periodStart: null,
    periodEnd: null,
    archivedAt: null,
    goals: [
      {
        id: "goal-1",
        groupId: "group-1",
        title: "Learn Japanese",
        category: { id: "learning", name: "Learning" },
        tags: [{ id: "focus", name: "focus" }],
        dueDate: null,
        status: "todo",
        position: 0,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function renderGoals() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/goals"]}>
        <Routes>
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/goals/:goalId" element={<LocationPath />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function LocationPath() {
  const { t } = useT();
  return <p>{t("goals.currentPath", { path: useLocation().pathname })}</p>;
}

function stubListServer(initialGroups = [group()]) {
  const groups = [...initialGroups];
  const archived: Array<ReturnType<typeof group>> = [];
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ url, method, body });

      if (url === "/api/goals" && method === "GET") return json({ groups });
      if (url === "/api/goals?archived=1" && method === "GET") return json({ groups: archived });
      if (url === "/api/goals/vocabulary" && method === "GET") {
        return json({
          tags: [{ id: "focus", name: "focus" }],
          categories: [{ id: "learning", name: "Learning" }],
        });
      }
      if (url === "/api/goals/groups" && method === "POST") {
        const input = JSON.parse(body ?? "{}") as { name: string };
        const created = group({ id: `group-${groups.length + 1}`, name: input.name, position: groups.length, goals: [] });
        groups.push(created);
        return json(created, 201);
      }
      const groupPatch = url.match(/^\/api\/goals\/groups\/([^/]+)$/);
      if (groupPatch !== null && method === "PATCH") {
        const id = decodeURIComponent(groupPatch[1]!);
        const input = JSON.parse(body ?? "{}") as Record<string, unknown>;
        const activeIndex = groups.findIndex((entry) => entry.id === id);
        const archivedIndex = archived.findIndex((entry) => entry.id === id);
        const current = activeIndex >= 0 ? groups[activeIndex]! : archived[archivedIndex]!;
        const updated = {
          ...current,
          ...input,
          archivedAt: input.archived === true ? now : input.archived === false ? null : current.archivedAt,
        } as ReturnType<typeof group>;
        if (input.archived === true) {
          groups.splice(activeIndex, 1);
          archived.push(updated);
        } else if (input.archived === false) {
          archived.splice(archivedIndex, 1);
          groups.push(updated);
        } else if (activeIndex >= 0) {
          groups[activeIndex] = updated;
        } else {
          archived[archivedIndex] = updated;
        }
        return json(updated);
      }
      if (url === "/api/goals/groups/group-1" && method === "DELETE") {
        groups.splice(0, 1);
        return json({ deleted: "group-1" });
      }
      if (url === "/api/goals/groups/group-1/goals" && method === "POST") {
        const input = JSON.parse(body ?? "{}") as { title: string };
        const created = {
          id: "goal-2",
          groupId: "group-1",
          title: input.title,
          category: null,
          tags: [],
          dueDate: null,
          status: "todo",
          position: groups[0]!.goals.length,
          updatedAt: now,
          createdAt: now,
          content: { type: "doc", content: [{ type: "paragraph" }] },
        };
        groups[0]!.goals.push({ ...created, createdAt: undefined, content: undefined } as never);
        return json(created, 201);
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    }),
  );
  return { groups, calls };
}

function stubStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

beforeEach(() => {
  stubStorage();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GoalsPage", () => {
  it("renders groups as an open index and loads summaries without goal documents", async () => {
    const server = stubListServer();
    renderGoals();

    expect(await screen.findByRole("heading", { level: 1, name: "Goals" })).toBeInTheDocument();
    const groupRegion = await screen.findByRole("region", { name: "Personal" });
    expect(within(groupRegion).getByRole("heading", { level: 2, name: "Personal" })).toBeInTheDocument();
    expect(within(groupRegion).getByRole("link", { name: /Learn Japanese/ })).toHaveAttribute("href", "/goals/goal-1");
    expect(within(groupRegion).getByText("#focus")).toBeInTheDocument();
    expect(within(groupRegion).getByText("Learning")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Goal content" })).not.toBeInTheDocument();
    expect(server.calls).toEqual([
      { url: "/api/goals", method: "GET", body: null },
      { url: "/api/goals?archived=1", method: "GET", body: null },
      { url: "/api/goals/vocabulary", method: "GET", body: null },
    ]);
  });

  it("filters goals by status and counts what is done per group", async () => {
    stubListServer();
    renderGoals();

    expect(await screen.findByText(/0\/1 done/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Learn Japanese/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("link", { name: /Learn Japanese/ })).not.toBeInTheDocument();
    expect(screen.getByText(/0 of 1 shown/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByRole("link", { name: /Learn Japanese/ })).toBeInTheDocument();
  });

  it("searches titles, keeps the filter choice and moves a group up", async () => {
    stubListServer([
      group(),
      group({
        id: "group-2",
        name: "Work",
        position: 1,
        goals: [{
          id: "goal-2",
          groupId: "group-2",
          title: "Ship the redesign",
          category: null,
          tags: [],
          dueDate: null,
          status: "todo",
          position: 0,
          updatedAt: now,
        }],
      }),
    ]);
    renderGoals();

    await screen.findByRole("region", { name: "Personal" });
    const search = screen.getByRole("searchbox", { name: "Search goals" });
    fireEvent.change(search, { target: { value: "redesign" } });
    expect(await screen.findByRole("link", { name: /Ship the redesign/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Learn Japanese/ })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem("chub.goals.view") ?? "{}")).toMatchObject({ status: "done" });
    });
    fireEvent.click(screen.getByRole("button", { name: "All" }));

    fireEvent.click(screen.getByRole("button", { name: "Work actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move up" }));
    await waitFor(() => {
      const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
      expect(headings.slice(0, 2)).toEqual(["Work", "Personal"]);
    });
  });

  it("creates a group inline, creates a goal, and opens its detail route", async () => {
    const server = stubListServer([]);
    renderGoals();

    expect(await screen.findByText(/No goal groups yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New group" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), { target: { value: "Health" } });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    const healthGroup = await screen.findByRole("region", { name: "Health" });
    fireEvent.click(within(healthGroup).getByRole("button", { name: "New goal" }));
    const composer = within(healthGroup).getByRole("textbox", { name: "Add a goal to Health" });
    fireEvent.change(composer, { target: { value: "Walk every morning" } });
    fireEvent.submit(composer.closest("form")!);

    expect(await screen.findByText("Current path: /goals/goal-2")).toBeInTheDocument();
    expect(server.calls).toContainEqual({ url: "/api/goals/groups", method: "POST", body: JSON.stringify({ name: "Health" }) });
    expect(server.calls).toContainEqual({
      url: "/api/goals/groups/group-1/goals",
      method: "POST",
      body: JSON.stringify({ title: "Walk every morning" }),
    });
  });

  it("renames a group and requires confirmation before cascading its deletion", async () => {
    const server = stubListServer();
    renderGoals();
    const groupRegion = await screen.findByRole("region", { name: "Personal" });

    fireEvent.click(within(groupRegion).getByRole("button", { name: "Personal actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), { target: { value: "Learning" } });
    fireEvent.click(screen.getByRole("button", { name: "Save group name" }));

    const renamedRegion = await screen.findByRole("region", { name: "Learning" });
    expect(server.calls).toContainEqual({ url: "/api/goals/groups/group-1", method: "PATCH", body: JSON.stringify({ name: "Learning" }) });

    fireEvent.click(within(renamedRegion).getByRole("button", { name: "Learning actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete group" }));
    expect(await screen.findByRole("heading", { name: "Delete this group?" })).toBeInTheDocument();
    expect(screen.getByText(/“Learning” and its goals will be deleted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(server.calls.some(({ method }) => method === "DELETE")).toBe(false);

    fireEvent.click(within(renamedRegion).getByRole("button", { name: "Learning actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete group" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
    await waitFor(() => expect(server.calls).toContainEqual({ url: "/api/goals/groups/group-1", method: "DELETE", body: null }));
    expect(screen.queryByRole("region", { name: "Learning" })).not.toBeInTheDocument();
  });

  it("sets a period on a group and archives it into the archived list", async () => {
    const server = stubListServer();
    renderGoals();
    const groupRegion = await screen.findByRole("region", { name: "Personal" });

    fireEvent.click(within(groupRegion).getByRole("button", { name: "Personal actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Set period…" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Save period" }));

    await waitFor(() => {
      expect(server.calls).toContainEqual({
        url: "/api/goals/groups/group-1",
        method: "PATCH",
        body: JSON.stringify({ periodStart: "2026-10-01", periodEnd: "2026-12-31" }),
      });
    });
    expect(await within(groupRegion).findByText(/Oct 1 – Dec 31/)).toBeInTheDocument();

    fireEvent.click(within(groupRegion).getByRole("button", { name: "Personal actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archive group" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Personal" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Archived groups/ }));
    const archivedList = screen.getByRole("list");
    expect(within(archivedList).getByText("Personal")).toBeInTheDocument();

    fireEvent.click(within(archivedList).getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("region", { name: "Personal" })).toBeInTheDocument();
  });

  it("shows an empty state and can retry a failed load", async () => {
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempt += 1;
        return attempt === 1 ? json({ error: "database_unavailable" }, 500) : json({ groups: [] });
      }),
    );
    renderGoals();

    expect(await screen.findByRole("alert")).toHaveTextContent("database_unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/No goal groups yet/)).toBeInTheDocument();
    // One load reads active and archived groups, so a retry costs two requests.
    expect(attempt).toBe(6);
  });
});
