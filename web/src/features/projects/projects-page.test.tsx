import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/app/theme-provider";
import { ProjectsPage } from "./projects-page";
import type { CalendarTask, ProjectSummary } from "./projects-api";

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

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "project-1",
    name: "Website redesign",
    description: "Landing page, new brand, copy",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    taskCount: 3,
    doneTaskCount: 1,
    columns: [
      { id: "column-backlog", name: "Backlog", isCompleted: false, taskCount: 2 },
      { id: "column-doing", name: "In progress", isCompleted: false, taskCount: 0 },
      { id: "column-done", name: "Done", isCompleted: true, taskCount: 1 },
    ],
    ...overrides,
  };
}

function makeCalendarTask(overrides: Partial<CalendarTask> = {}): CalendarTask {
  return {
    id: "task-1",
    title: "Write the first draft",
    dueDate: "2026-10-20",
    projectId: "project-1",
    projectName: "Website redesign",
    columnId: "column-backlog",
    columnName: "Backlog",
    isCompleted: false,
    ...overrides,
  };
}

/** A tiny in-memory server so the page exercises the real client against real request shapes. */
function stubServer(options: { projects?: ProjectSummary[]; tasks?: CalendarTask[] } = {}) {
  const projects = [...(options.projects ?? [makeProject()])];
  const tasks = [...(options.tasks ?? [makeCalendarTask()])];
  const calls: Array<{ url: string; method: string; body: string | null }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ url, method, body });

      if (url === "/api/projects" && method === "GET") return json({ projects: [...projects] });
      if (url === "/api/projects?archived=1" && method === "GET") return json({ projects: [] });
      if (url === "/api/projects" && method === "POST") {
        const created = makeProject({
          id: `project-${projects.length + 1}`,
          name: (JSON.parse(body ?? "{}") as { name: string }).name,
          description: null,
          taskCount: 0,
          doneTaskCount: 0,
          columns: [],
        });
        projects.push(created);
        return json(created, 201);
      }
      if (url.startsWith("/api/tasks?")) return json({ tasks: [...tasks] });

      return json({ error: "not_found" }, 404);
    }),
  );

  return { projects, tasks, calls };
}

function renderPage(initialEntry = "/projects") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ProjectsPage />
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

describe("ProjectsPage", () => {
  it("shows every project with the shape of its work", async () => {
    stubServer();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(await screen.findByText("1 project · 3 tasks · 1 done")).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: "Website redesign" });
    expect(link).toHaveAttribute("href", "/projects/project-1");
    expect(screen.getByLabelText("3 tasks, 1 done")).toBeInTheDocument();

    const preview = document.querySelector('[aria-hidden="true"].grid-flow-col');
    expect(preview).not.toBeNull();
    if (preview === null) throw new Error("Expected a project board preview");

    const laneNames = Array.from(preview.querySelectorAll("span"));
    const inProgressName = laneNames.find((node) => node.textContent === "In progress");
    expect(inProgressName).toHaveClass("hidden", "lg:inline");
    expect(preview).toHaveClass("h-[82px]");

    const taskCards = Array.from(preview.querySelectorAll("div")).filter((node) =>
      node.classList.contains("bg-foreground/10"),
    );
    expect(taskCards[0]?.querySelectorAll("span")).toHaveLength(2);
    expect(preview.children[2]).toHaveClass("bg-muted/80");
  });

  it("keeps rename and delete actions on each project row", async () => {
    stubServer();
    renderPage();

    const actions = await screen.findByRole("button", { name: "Website redesign actions" });
    fireEvent.click(actions);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const renameDialog = await screen.findByRole("dialog");
    expect(within(renameDialog).getByRole("heading", { name: "Edit project" })).toBeInTheDocument();
    fireEvent.click(within(renameDialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(actions);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "Delete this project?" })).toBeInTheDocument();
  });

  it("says so when there is no project yet", async () => {
    stubServer({ projects: [] });
    renderPage();

    expect(await screen.findByText("Create a project to give its work a board of its own.")).toBeInTheDocument();
  });

  it("creates a project from the dialog", async () => {
    const server = stubServer({ projects: [] });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "New project" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Essays" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(server.projects.map((project) => project.name)).toEqual(["Essays"]));
  });

  it("reviews every task of the month in the calendar", async () => {
    const server = stubServer();
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Calendar" }));

    expect(await screen.findByRole("button", { name: /Write the first draft/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(server.calls.some((call) => call.url.startsWith("/api/tasks?from="))).toBe(true),
    );
  });

  it("narrows the calendar to a single project", async () => {
    const server = stubServer({
      projects: [makeProject(), makeProject({ id: "project-2", name: "Essays" })],
      tasks: [
        makeCalendarTask(),
        makeCalendarTask({ id: "task-2", title: "Outline chapter one", projectId: "project-2", projectName: "Essays" }),
      ],
    });
    renderPage("/projects?view=calendar&project=project-2");

    expect(await screen.findByRole("button", { name: /Outline chapter one/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Write the first draft/ })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(server.calls.some((call) => call.url.startsWith("/api/tasks?from="))).toBe(true),
    );
  });
});
