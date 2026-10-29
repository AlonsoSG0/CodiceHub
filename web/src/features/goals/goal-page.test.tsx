import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/app/theme-provider";
import { useT } from "@/i18n";
import { GoalPage } from "./goal-page";

vi.mock("@/components/editor/note-editor", () => ({
  NoteEditor: ({ value, onChange }: { value: JSONContent; onChange: (next: JSONContent) => void }) => {
    const { t } = useT();
    return (
      <textarea
        aria-label={t("goals.document")}
        value={JSON.stringify(value)}
        onChange={(event) => onChange(JSON.parse(event.currentTarget.value) as JSONContent)}
      />
    );
  },
}));

const now = "2026-10-23T00:00:00.000Z";
const contentOne: JSONContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "First document" }] }] };
const contentTwo: JSONContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Second document" }] }] };

function makeGoal(id = "goal-1", title = "Learn Japanese", content: JSONContent = contentOne) {
  return {
    id,
    groupId: "group-1",
    title,
    category: null,
    tags: [{ id: "focus", name: "focus" }],
    dueDate: null,
    status: "todo",
    position: id === "goal-1" ? 0 : 1,
    updatedAt: now,
    createdAt: now,
    content,
  };
}

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(JSON.stringify(body)),
  } as Response;
}

async function chooseCategory(optionName: string) {
  fireEvent.click(screen.getByRole("button", { name: /^Category:/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: optionName }));
}

function stubGoalServer({ failFirstGoalLoad = false, failFirstPatch = false }: { failFirstGoalLoad?: boolean; failFirstPatch?: boolean } = {}) {
  const goals = new Map([
    ["goal-1", makeGoal()],
    ["goal-2", makeGoal("goal-2", "Build a garden", contentTwo)],
  ]);
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  let goalLoads = 0;
  let patchFailures = failFirstPatch ? 1 : 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ url, method, body });

      if (url.startsWith("/api/goals/items/") && method === "GET") {
        goalLoads += 1;
        if (failFirstGoalLoad && goalLoads === 1) return json({ error: "database_unavailable" }, 500);
        const id = url.slice("/api/goals/items/".length);
        const goal = goals.get(id);
        return goal ? json(goal) : json({ error: "goal_not_found" }, 404);
      }
      if (url === "/api/goals" && method === "GET") {
        return json({
          groups: [{
            id: "group-1",
            name: "Personal",
            position: 0,
            goals: [...goals.values()].map(({ content: _content, createdAt: _createdAt, ...summary }) => summary),
            periodStart: null,
            periodEnd: null,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          }],
        });
      }
      if (url === "/api/checklists" && method === "GET") {
        return json({
          checklists: [{
            id: "list-1",
            name: "Work",
            position: 0,
            createdAt: now,
            updatedAt: now,
            items: [
              {
                id: "task-1",
                listId: "list-1",
                text: "Draft the plan",
                done: false,
                dueDate: null,
                priority: "none",
                recurrence: "none",
                goalId: "goal-1",
                position: 0,
                createdAt: now,
                updatedAt: now,
              },
              {
                id: "task-2",
                listId: "list-1",
                text: "Unrelated chore",
                done: false,
                dueDate: null,
                priority: "none",
                recurrence: "none",
                goalId: null,
                position: 1,
                createdAt: now,
                updatedAt: now,
              },
            ],
          }],
        });
      }
      if (url === "/api/checklists/items/task-2" && method === "PATCH") {
        return json({
          id: "task-2", listId: "list-1", text: "Unrelated chore", done: false, dueDate: null,
          priority: "none", recurrence: "none", goalId: JSON.parse(body ?? "{}").goalId ?? null,
          position: 1, createdAt: now, updatedAt: now,
        });
      }
      if (url === "/api/checklists/items/task-1" && method === "PATCH") {
        return json({
          id: "task-1", listId: "list-1", text: "Draft the plan", done: false, dueDate: null,
          priority: "none", recurrence: "none", goalId: JSON.parse(body ?? "{}").goalId ?? "goal-1",
          position: 0, createdAt: now, updatedAt: now,
        });
      }
      if (url === "/api/goals/vocabulary" && method === "GET") {
        return json({
          tags: [{ id: "focus", name: "focus" }, { id: "health", name: "health" }],
          categories: [{ id: "wellbeing", name: "Wellbeing" }],
        });
      }
      if (url.startsWith("/api/goals/items/") && method === "PATCH") {
        if (patchFailures > 0) {
          patchFailures -= 1;
          return json({ error: "write_failed" }, 500);
        }
        const id = url.slice("/api/goals/items/".length);
        const updated = { ...goals.get(id)!, ...JSON.parse(body ?? "{}") };
        goals.set(id, updated);
        return json(updated);
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    }),
  );
  return { calls, getGoalLoads: () => goalLoads };
}

function GoalNextLink() {
  const { t } = useT();
  return <Link to="/goals/goal-2">{t("goals.nextGoal")}</Link>;
}

function renderGoal(initialPath = "/goals/goal-1") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/goals/:goalId"
            element={
              <>
                <GoalPage />
                <GoalNextLink />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GoalPage", () => {
  it("edits title, rich content, tags, and category through the visible autosave", async () => {
    const server = stubGoalServer();
    renderGoal();

    expect(await screen.findByRole("link", { name: "Back to Goals" })).toHaveAttribute("href", "/goals");
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Goal document" })).toHaveLength(1);

    fireEvent.change(screen.getByRole("textbox", { name: "Goal title" }), { target: { value: "Study Japanese" } });
    const tagInput = screen.getByRole("combobox", { name: "Tags" });
    fireEvent.change(tagInput, { target: { value: "hea" } });
    expect(await screen.findByRole("option", { name: "#health" })).toBeInTheDocument();
    fireEvent.keyDown(tagInput, { key: "ArrowDown" });
    fireEvent.keyDown(tagInput, { key: "Enter", code: "Enter" });
    fireEvent.change(tagInput, { target: { value: "Travel" } });
    fireEvent.keyDown(tagInput, { key: "Enter", code: "Enter" });
    fireEvent.keyDown(tagInput, { key: "Backspace", code: "Backspace" });
    expect(screen.queryByText("#travel")).not.toBeInTheDocument();
    fireEvent.change(tagInput, { target: { value: "Travel" } });
    fireEvent.keyDown(tagInput, { key: "Enter", code: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Remove #focus" }));

    await chooseCategory("New category…");
    const newCategory = await screen.findByRole("textbox", { name: "New category" });
    fireEvent.change(newCategory, { target: { value: "Career" } });
    fireEvent.submit(newCategory.closest("form")!);

    const nextContent: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A deliberate study plan" }] }],
    };
    fireEvent.change(screen.getByRole("textbox", { name: "Goal document" }), { target: { value: JSON.stringify(nextContent) } });

    await waitFor(
      () => {
        const patch = server.calls.find(({ url, method }) => url === "/api/goals/items/goal-1" && method === "PATCH");
        expect(patch).toBeDefined();
        expect(JSON.parse(patch!.body ?? "{}")).toMatchObject({
          title: "Study Japanese",
          content: nextContent,
          categoryName: "Career",
          tagNames: ["health", "travel"],
        });
      },
      { timeout: 2500 },
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");

    await chooseCategory("No category");
    await waitFor(
      () => {
        const patches = server.calls.filter(({ url, method }) => url === "/api/goals/items/goal-1" && method === "PATCH");
        expect(patches.some(({ body }) => JSON.parse(body ?? "{}").categoryName === null)).toBe(true);
      },
      { timeout: 2500 },
    );
  });

  it("sets a status and a due date, and unlinks a task from the goal", async () => {
    const server = stubGoalServer();
    renderGoal();

    const linked = await screen.findByRole("checkbox", { name: "Draft the plan" });
    expect(linked).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /In progress/ }));
    await waitFor(() => {
      expect(server.calls.some(({ url, method, body }) =>
        url === "/api/goals/items/goal-1" && method === "PATCH" && body?.includes('"status":"doing"'),
      )).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Set goal due date" }));
    fireEvent.change(screen.getByLabelText("Goal due date"), { target: { value: "2026-12-01" } });
    await waitFor(() => {
      expect(server.calls.some(({ body }) => body?.includes('"dueDate":"2026-12-01"'))).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Unlink Draft the plan" }));
    await waitFor(() => {
      expect(server.calls.some(({ url, method, body }) =>
        url === "/api/checklists/items/task-1" && method === "PATCH" && body?.includes('"goalId":null'),
      )).toBe(true);
    });
  });

  it("links an unlinked task found by title", async () => {
    const server = stubGoalServer();
    renderGoal();

    fireEvent.click(await screen.findByRole("button", { name: "Link a task" }));
    const search = await screen.findByRole("searchbox", { name: "Search tasks" });
    fireEvent.change(search, { target: { value: "unrelated" } });

    fireEvent.click(await screen.findByRole("button", { name: "Unrelated chore" }));
    await waitFor(() => {
      expect(server.calls.some(({ url, method, body }) =>
        url === "/api/checklists/items/task-2" && method === "PATCH" && body?.includes('"goalId":"goal-1"'),
      )).toBe(true);
    });
    expect(screen.queryByRole("searchbox", { name: "Search tasks" })).not.toBeInTheDocument();
  });

  it("flushes the previous record on navigation and mounts the next document independently", async () => {
    const server = stubGoalServer();
    renderGoal();

    const editor = await screen.findByRole("textbox", { name: "Goal document" });
    const editedContent: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Only belongs to goal one" }] }],
    };
    fireEvent.change(editor, { target: { value: JSON.stringify(editedContent) } });
    fireEvent.click(screen.getByRole("link", { name: "Open next goal" }));

    const nextEditor = await screen.findByRole("textbox", { name: "Goal document" });
    await waitFor(() => expect(nextEditor).toHaveValue(JSON.stringify(contentTwo)));
    await waitFor(() => {
      const previousSave = server.calls.find(({ url, method }) => url === "/api/goals/items/goal-1" && method === "PATCH");
      expect(previousSave).toBeDefined();
      expect(JSON.parse(previousSave!.body ?? "{}").content).toEqual(editedContent);
    });
    expect(server.calls.some(({ url, method, body }) => url === "/api/goals/items/goal-2" && method === "PATCH" && body?.includes("Only belongs to goal one"))).toBe(false);
    expect(screen.getAllByRole("textbox", { name: "Goal document" })).toHaveLength(1);
  });

  it("recovers from a load failure and keeps the route back to the index", async () => {
    const server = stubGoalServer({ failFirstGoalLoad: true });
    renderGoal();

    expect(await screen.findByRole("alert")).toHaveTextContent("database_unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("textbox", { name: "Goal title" })).toHaveValue("Learn Japanese");
    expect(screen.getByRole("link", { name: "Back to Goals" })).toHaveAttribute("href", "/goals");
    expect(server.getGoalLoads()).toBe(2);
  });

  it("keeps local edits visible when autosave fails", async () => {
    stubGoalServer({ failFirstPatch: true });
    renderGoal();

    const title = await screen.findByRole("textbox", { name: "Goal title" });
    fireEvent.change(title, { target: { value: "A title waiting to save" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("write_failed");
    expect(screen.getByRole("textbox", { name: "Goal title" })).toHaveValue("A title waiting to save");
    expect(screen.getByRole("status")).toHaveTextContent("Save failed");
  });
});
