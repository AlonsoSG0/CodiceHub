import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/app/theme-provider";
import { BoardPage } from "./board-page";
import type { Column, Task } from "./projects-api";

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function makeColumn(overrides: Partial<Column> = {}): Column {
  return {
    id: "column-backlog",
    projectId: "project-1",
    name: "Backlog",
    isCompleted: false,
    position: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    projectId: "project-1",
    columnId: "column-backlog",
    title: "Write the first draft",
    description: null,
    dueDate: null,
    priority: "none",
    goalId: null,
    position: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A tiny in-memory server so the page exercises the real client against real request shapes. */
function stubServer() {
  const columns = [
    makeColumn(),
    makeColumn({ id: "column-doing", name: "In progress", position: 1 }),
    makeColumn({ id: "column-done", name: "Done", isCompleted: true, position: 2 }),
  ];
  const tasks = [
    makeTask(),
    makeTask({
      id: "task-2",
      title: "Ship the landing page",
      columnId: "column-done",
      position: 0,
      dueDate: "2026-10-20",
    }),
  ];
  const calls: Array<{ url: string; method: string; body: string | null }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ url, method, body });

      if (url === "/api/projects/project-1/board") {
        return json({
          project: {
            id: "project-1",
            name: "Website redesign",
            description: "Landing page, new brand, copy",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          columns: [...columns],
          tasks: [...tasks],
        });
      }
      if (url === "/api/projects/project-1/tasks" && method === "POST") {
        const created = makeTask({
          id: `task-${tasks.length + 1}`,
          title: (JSON.parse(body ?? "{}") as { title: string }).title,
          columnId: (JSON.parse(body ?? "{}") as { columnId?: string }).columnId ?? "column-backlog",
          position: tasks.length,
        });
        tasks.push(created);
        return json(created, 201);
      }
      if (url === "/api/projects/project-1/layout" && method === "PUT") return json({ columns, tasks });

      return json({ error: "not_found" }, 404);
    }),
  );

  return { columns, tasks, calls };
}

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/projects/project-1"]}>
        <Routes>
          <Route path="/projects/:projectId" element={<BoardPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  const storageValues = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() { return storageValues.size },
      clear: () => storageValues.clear(),
      getItem: (key: string) => storageValues.get(key) ?? null,
      key: (index: number) => [...storageValues.keys()][index] ?? null,
      removeItem: (key: string) => { storageValues.delete(key) },
      setItem: (key: string, value: string) => { storageValues.set(String(key), String(value)) },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BoardPage", () => {
  it("shows the board of the project with its columns and their cards", async () => {
    stubServer();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Website redesign" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Backlog" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Done" })).toBeInTheDocument();

    expect(await screen.findByText("Write the first draft")).toBeInTheDocument();
    expect(screen.getByText("Ship the landing page")).toBeInTheDocument();
  });

  it("counts the tasks of every column", async () => {
    stubServer();
    renderPage();

    const backlog = (await screen.findByRole("heading", { name: "Backlog" })).parentElement;
    expect(backlog).toHaveTextContent("1");
    expect(screen.getByText("No tasks in this column.")).toBeInTheDocument();
  });

  it("exposes project progress from the completed-column tasks", async () => {
    stubServer();
    renderPage();

    expect(await screen.findByText("1 of 2 done")).toBeInTheDocument();
    expect(await screen.findByRole("progressbar", { name: "Project progress" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("writes a task from the composer of its column", async () => {
    const server = stubServer();
    renderPage();

    const composer = (await screen.findAllByRole("button", { name: "Add task" }))[0]!;
    fireEvent.click(composer);

    const input = screen.getByLabelText("Task title");
    fireEvent.change(input, { target: { value: "Collect references" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() =>
      expect(server.tasks.map((task) => task.title)).toContain("Collect references"),
    );
    expect(await screen.findByText("Collect references")).toBeInTheDocument();
  });

  it("opens a task with its own data", async () => {
    stubServer();
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Open Write the first draft" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Write the first draft");
  });
});
