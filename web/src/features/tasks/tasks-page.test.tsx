import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Checklist, ChecklistItem } from "./tasks-api";
import { TasksPage } from "./tasks-page";
import { setPreference } from "@/features/settings/preferences";
import { dayKeyOf } from "@/features/habits/date";
import { ThemeProvider } from "@/app/theme-provider";
import { MemoryRouter } from "react-router-dom";

const now = Date.now();
const todayIso = new Date(now - 60_000).toISOString();
const yesterdayIso = new Date(now - 26 * 60 * 60 * 1000).toISOString();
const oldIso = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(JSON.stringify(body)) as unknown,
  } as Response;
}

function makeItem(
  id: string,
  listId: string,
  text: string,
  done: boolean,
  position: number,
  createdAt = todayIso,
  extra: Partial<ChecklistItem> = {},
): ChecklistItem {
  return { id, listId, text, done, dueDate: null, priority: "none", recurrence: "none", goalId: null, position, createdAt, updatedAt: createdAt, ...extra };
}

function makeChecklist(id: string, name: string, items: ChecklistItem[], position: number): Checklist {
  return {
    id,
    name,
    position,
    items,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** A tiny in-memory server so the page exercises the real client against the public request shapes. */
function stubServer(options: {
  prune?: { deletedItems: number; deletedGroups: number };
  empty?: boolean;
  items?: ChecklistItem[];
  preferences?: Record<string, unknown>;
} = {}) {
  const checklists: Checklist[] = options.empty ? [] : [
    makeChecklist("quick", "Quick tasks", [makeItem("email", "quick", "Email Sam", false, 0)], 0),
    makeChecklist("errands", "Errands", [makeItem("milk", "errands", "Buy milk", true, 0, yesterdayIso)], 1),
    makeChecklist("backlog", "Backlog", options.items ?? [
      makeItem("parcel", "backlog", "Return the parcel", false, 0, oldIso),
      makeItem("invoice", "backlog", "Send the invoice", true, 1, oldIso),
    ], 2),
  ];
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  let nextListId = 1;
  let nextItemId = 1;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ url, method, body });

      if (url === "/api/preferences" && method === "GET") return json({ preferences: options.preferences ?? {} });
      if (url.startsWith("/api/preferences/") && method === "PUT") {
        return json({ key: url.slice("/api/preferences/".length), ...JSON.parse(body ?? "{}") as object });
      }

      if (url === "/api/goals" && method === "GET") {
        return json({
          groups: [{
            id: "goal-group-1",
            name: "Learning",
            position: 0,
            periodStart: null,
            periodEnd: null,
            archivedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            goals: [{
              id: "goal-1",
              groupId: "goal-group-1",
              title: "Ship the redesign",
              category: null,
              tags: [],
              dueDate: null,
              status: "todo",
              position: 0,
              updatedAt: "2026-01-01T00:00:00.000Z",
            }],
          }],
        });
      }

      if (url === "/api/checklists/prune" && method === "POST") {
        return json(options.prune ?? { deletedItems: 0, deletedGroups: 0 });
      }

      if (url === "/api/checklists" && method === "GET") {
        return json({ checklists: JSON.parse(JSON.stringify(checklists)) as Checklist[] });
      }

      if (url === "/api/checklists" && method === "POST") {
        const { name } = JSON.parse(body ?? "{}") as { name: string };
        const created = makeChecklist(`list-${nextListId++}`, name, [], checklists.length);
        checklists.push(created);
        return json(created, 201);
      }

      const itemCreate = url.match(/^\/api\/checklists\/([^/]+)\/items$/);
      if (itemCreate !== null && method === "POST") {
        const listId = decodeURIComponent(itemCreate[1]!);
        const checklist = checklists.find((entry) => entry.id === listId)!;
        const { text } = JSON.parse(body ?? "{}") as { text: string };
        const created = makeItem(`item-${nextItemId++}`, listId, text, false, checklist.items.length);
        checklist.items.push(created);
        return json(created, 201);
      }

      const bulk = url.match(/^\/api\/checklists\/([^/]+)\/bulk$/);
      if (bulk !== null && method === "POST") {
        const listId = decodeURIComponent(bulk[1]!);
        const checklist = checklists.find((entry) => entry.id === listId)!;
        const { action } = JSON.parse(body ?? "{}") as { action: string };
        if (action === "complete-open") checklist.items.forEach((item) => { item.done = true; });
        else checklist.items = checklist.items.filter((item) => !item.done);
        return json(checklist);
      }

      const itemDelete = url.match(/^\/api\/checklists\/items\/([^/]+)$/);
      if (itemDelete !== null && method === "DELETE") {
        const id = decodeURIComponent(itemDelete[1]!);
        const checklist = checklists.find((entry) => entry.items.some((item) => item.id === id))!;
        checklist.items = checklist.items.filter((item) => item.id !== id);
        return json({ deleted: id });
      }

      const itemUpdate = url.match(/^\/api\/checklists\/items\/([^/]+)$/);
      if (itemUpdate !== null && method === "PATCH") {
        const id = decodeURIComponent(itemUpdate[1]!);
        const patch = JSON.parse(body ?? "{}") as Partial<Pick<ChecklistItem, "text" | "done">>;
        const checklist = checklists.find((entry) => entry.items.some((item) => item.id === id))!;
        const item = checklist.items.find((entry) => entry.id === id)!;
        Object.assign(item, patch);
        return json(item);
      }

      throw new Error(`unexpected request: ${method} ${url}`);
    }),
  );

  return { checklists, calls };
}

function renderPage() {
  render(
    <ThemeProvider>
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

/** jsdom here inherits a partial Node storage; give the page a complete, isolated one. */
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
  window.localStorage.clear();
});

describe("TasksPage", () => {
  it("separates today from yesterday, keeps the debt beside them and past days on demand", async () => {
    stubServer();
    renderPage();

    const todayList = await screen.findByRole("list", { name: "Today checks" });
    expect(within(todayList).getByRole("checkbox", { name: "Email Sam" })).toBeInTheDocument();
    const yesterdayList = screen.getByRole("list", { name: "Yesterday checks" });
    expect(within(yesterdayList).getByRole("checkbox", { name: "Buy milk" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /^Today ·/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /^Yesterday ·/ })).toBeInTheDocument();

    // The debt column is always visible and carries task, group and date.
    const debt = screen.getByRole("list", { name: "Unclosed checks" });
    expect(within(debt).getByRole("checkbox", { name: "Return the parcel" })).toBeInTheDocument();
    expect(within(debt).getByText(/Backlog ·/)).toBeInTheDocument();

    // Past days hold everything old, closed included.
    fireEvent.click(screen.getByRole("button", { name: "Past days (2)" }));
    expect(await screen.findByRole("checkbox", { name: "Send the invoice" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: "Return the parcel" })).toHaveLength(2);

    // Both day blocks collapse without losing their data.
    fireEvent.click(screen.getByRole("button", { name: /^Today ·/ }));
    expect(screen.queryByRole("list", { name: "Today checks" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Today ·/ }));
    expect(screen.getByRole("list", { name: "Today checks" })).toBeInTheDocument();
  });

  it("flips the debt order and sets a priority and a due date from a group row", async () => {
    const patient = makeItem("old-a", "backlog", "Older", false, 2, new Date(now - 25 * 864e5).toISOString());
    const recent = makeItem("old-b", "backlog", "Newer", false, 3, new Date(now - 3 * 864e5).toISOString());
    const server = stubServer({ items: [patient, recent] });
    renderPage();

    const debt = await screen.findByRole("list", { name: "Unclosed checks" });
    const names = () => within(debt).getAllByRole("checkbox").map((node) => node.getAttribute("aria-label"));
    expect(names()).toEqual(["Older", "Newer"]);

    fireEvent.click(screen.getByRole("button", { name: "Oldest first" }));
    expect(names()).toEqual(["Newer", "Older"]);

    fireEvent.click(screen.getByRole("button", { name: "Groups" }));
    const priorityButton = screen.getAllByRole("button", { name: "Priority: None" })[0]!;
    fireEvent.click(priorityButton);
    fireEvent.click(await screen.findByRole("menuitem", { name: /NOW/ }));

    await waitFor(() => {
      expect(server.calls.some(({ method, body }) => method === "PATCH" && body?.includes('"priority":"now"'))).toBe(true);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Set due date" })[0]!);
    const dateInput = screen.getByLabelText("Due date");
    fireEvent.change(dateInput, { target: { value: "2026-11-02" } });
    await waitFor(() => {
      expect(server.calls.some(({ method, body }) => method === "PATCH" && body?.includes('"dueDate":"2026-11-02"'))).toBe(true);
    });
  });

  it("captures into the chosen group, creates a group and toggles a check", async () => {
    const server = stubServer();
    renderPage();

    await screen.findByRole("checkbox", { name: "Email Sam" });
    const capture = screen.getByRole("textbox", { name: "New check" });
    fireEvent.change(capture, { target: { value: "Water the plants" } });
    fireEvent.submit(capture.closest("form")!);

    expect(await screen.findByRole("checkbox", { name: "Water the plants" })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(capture));
    expect(server.checklists[0]!.items.map(({ text }) => text)).toEqual(["Email Sam", "Water the plants"]);

    fireEvent.click(screen.getByRole("button", { name: "Groups" }));
    expect(screen.getByRole("heading", { level: 2, name: "Quick tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Backlog" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New group" }));
    const groupName = screen.getByRole("textbox", { name: "New group name" });
    fireEvent.change(groupName, { target: { value: "Weekend" } });
    fireEvent.submit(groupName.closest("form")!);

    expect(await screen.findByRole("heading", { level: 2, name: "Weekend" })).toBeInTheDocument();
    const composer = screen.getByRole("textbox", { name: "Add a check to Weekend" });
    fireEvent.change(composer, { target: { value: "Call the dentist" } });
    fireEvent.submit(composer.closest("form")!);
    expect(await screen.findByRole("checkbox", { name: "Call the dentist" })).toBeInTheDocument();

    // The Today row unmounted when the tab changed, so the groups view has its own node.
    const emailInGroups = screen.getByRole("checkbox", { name: "Email Sam" });
    fireEvent.click(emailInGroups);
    await waitFor(() => expect(emailInGroups).toHaveAttribute("aria-checked", "true"));
    expect(server.calls.some(({ url, method, body }) =>
      url === "/api/checklists/items/email" && method === "PATCH" && JSON.parse(body ?? "{}").done === true,
    )).toBe(true);
  });

  it("pulls a check into Today by its due date and reports the overdue count", async () => {
    const dueToday = makeItem("due-today", "backlog", "Due today", false, 10, new Date(now - 20 * 864e5).toISOString(), {
      dueDate: dayKeyOf(new Date(now)),
    });
    const overdue = makeItem("overdue", "backlog", "Overdue", false, 11, new Date(now - 20 * 864e5).toISOString(), {
      dueDate: dayKeyOf(new Date(now - 3 * 864e5)),
    });
    stubServer({ items: [dueToday, overdue] });
    renderPage();

    const todayList = await screen.findByRole("list", { name: "Today checks" });
    expect(within(todayList).getByRole("checkbox", { name: "Due today" })).toBeInTheDocument();
    const debt = screen.getByRole("list", { name: "Unclosed checks" });
    expect(within(debt).getByRole("checkbox", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.getByText("1 overdue")).toBeInTheDocument();
  });

  it("routes a trailing #group from the capture bar, creating the group when it is new", async () => {
    const server = stubServer();
    renderPage();

    const capture = await screen.findByRole("textbox", { name: "New check" });
    fireEvent.change(capture, { target: { value: "Comprar café #Personal" } });
    fireEvent.submit(capture.closest("form")!);

    expect(await screen.findByRole("checkbox", { name: "Comprar café" })).toBeInTheDocument();
    expect(server.checklists.find(({ name }) => name === "Personal")?.items.map(({ text }) => text)).toEqual([
      "Comprar café",
    ]);

    fireEvent.change(capture, { target: { value: "Armar el huerto #Huerta" } });
    fireEvent.submit(capture.closest("form")!);
    expect(await screen.findByRole("checkbox", { name: "Armar el huerto" })).toBeInTheDocument();
    expect(server.checklists.some(({ name }) => name === "Huerta")).toBe(true);
  });

  it("offers an undo after deleting a check and restores it", async () => {
    const server = stubServer();
    renderPage();

    const checklist = await screen.findByRole("list", { name: "Today checks" });
    const row = within(checklist).getByRole("checkbox", { name: "Email Sam" }).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Delete Email Sam" }));

    expect(await screen.findByText(/Deleted/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Email Sam" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("checkbox", { name: "Email Sam" })).toBeInTheDocument();
    expect(server.checklists[0]!.items.some(({ text }) => text === "Email Sam")).toBe(true);
  });

  it("lifts a group to the top when its badge is picked", async () => {
    stubServer();
    renderPage();

    await screen.findByRole("checkbox", { name: "Email Sam" });
    fireEvent.click(screen.getByRole("button", { name: "Groups" }));

    const headings = () => screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(headings()[0]).toBe("Quick tasks");

    const badgeRow = screen.getByRole("group", { name: "Jump to group" });
    const badge = within(badgeRow).getByRole("button", { name: "Backlog" });
    fireEvent.click(badge);
    expect(badge).toHaveAttribute("aria-pressed", "true");
    expect(headings()[0]).toBe("Backlog");

    fireEvent.click(badge);
    expect(badge).toHaveAttribute("aria-pressed", "false");
    expect(headings()[0]).toBe("Quick tasks");
  });

  it("closes every open check in a group from its menu", async () => {
    const server = stubServer();
    renderPage();

    await screen.findByRole("checkbox", { name: "Email Sam" });
    fireEvent.click(screen.getByRole("button", { name: "Groups" }));
    fireEvent.click(screen.getByRole("button", { name: "Quick tasks actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Close all open" }));

    await waitFor(() => {
      expect(server.checklists[0]!.items.every(({ done }) => done)).toBe(true);
    });
    expect(server.calls.some(({ url, method }) => url.endsWith("/bulk") && method === "POST")).toBe(true);
  });

  it("shows the goal a check serves", async () => {
    stubServer({
      items: [
        makeItem("linked", "backlog", "Draft the plan", false, 2, todayIso, { goalId: "goal-1" }),
      ],
    });
    renderPage();

    const todayList = await screen.findByRole("list", { name: "Today checks" });
    expect(within(todayList).getByText("Ship the redesign")).toBeInTheDocument();
  });

  it("runs the saved cleanup policy on open and reports what it removed", async () => {
    const server = stubServer({ prune: { deletedItems: 3, deletedGroups: 1 } });
    setPreference("modules.retention", "7");
    setPreference("modules.retentionScope", "completed");
    renderPage();

    await waitFor(() => expect(server.calls.some(({ url }) => url === "/api/checklists/prune")).toBe(true));
    const prune = server.calls.find(({ url }) => url === "/api/checklists/prune")!;
    expect(JSON.parse(prune.body ?? "{}")).toEqual({ olderThanDays: 7, scope: "completed" });
    expect(await screen.findByText(/Cleaned 3 old checks and 1 empty group\./)).toBeInTheDocument();
  });

  it("shows the full interface on an empty database and creates the default group on first capture", async () => {
    const server = stubServer({ empty: true });
    renderPage();

    expect(await screen.findByRole("heading", { level: 2, name: /^Today ·/ })).toBeInTheDocument();
    const capture = screen.getByRole("textbox", { name: "New check" });
    expect(screen.getByRole("button", { name: "Groups" })).toBeInTheDocument();

    fireEvent.change(capture, { target: { value: "First check" } });
    fireEvent.submit(capture.closest("form")!);

    expect(await screen.findByRole("checkbox", { name: "First check" })).toBeInTheDocument();
    expect(server.checklists.map(({ name }) => name)).toEqual(["Inbox"]);
  });

  it("saves the retention policy from the cleanup dialog", async () => {
    const server = stubServer();
    renderPage();

    await screen.findByRole("checkbox", { name: "Email Sam" });
    fireEvent.click(screen.getByRole("button", { name: "Cleanup settings" }));

    const retention = screen.getByRole("radiogroup", { name: "Retention" });
    fireEvent.click(within(retention).getByRole("radio", { name: "15 days" }));
    expect(within(retention).getByRole("radio", { name: "15 days" })).toHaveAttribute("aria-checked", "true");

    const scope = screen.getByRole("radiogroup", { name: "Scope" });
    fireEvent.click(within(scope).getByRole("radio", { name: "All checks" }));

    await waitFor(() => {
      expect(server.calls).toContainEqual({
        url: "/api/preferences/modules.retention",
        method: "PUT",
        body: JSON.stringify({ value: "15" }),
      });
      expect(server.calls).toContainEqual({
        url: "/api/preferences/modules.retentionScope",
        method: "PUT",
        body: JSON.stringify({ value: "all" }),
      });
    });
  });
});
