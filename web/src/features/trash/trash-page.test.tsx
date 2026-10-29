import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageMeta } from "@/lib/api";
import App from "@/App";

const deletedAt = "2025-02-10T12:30:00.000Z";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createPage(id: string, title: string, parentId: string | null, isDeleted: boolean): PageMeta {
  return {
    id,
    title,
    parentId,
    icon: null,
    position: 0,
    updatedAt: deletedAt,
    deletedAt: isDeleted ? deletedAt : null,
    favorite: false,
    sectionId: null,
  };
}

function stubApi({
  livePages = [],
  trashedPages = [],
  trashFailure = false,
}: {
  livePages?: PageMeta[];
  trashedPages?: PageMeta[];
  trashFailure?: boolean;
} = {}) {
  let tree = [...livePages];
  let trash = [...trashedPages];
  const requests: Array<{ url: string; method: string }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method });

    if (url === "/api/pages/tree" && method === "GET") return jsonResponse({ pages: tree });
    if (url === "/api/sections" && method === "GET") return jsonResponse({ sections: [] });
    if (url === "/api/pages/trash" && method === "GET") {
      return trashFailure
        ? jsonResponse({ error: "trash_unavailable" }, 500)
        : jsonResponse({ pages: trash });
    }

    const restoreMatch = url.match(/^\/api\/pages\/([^/]+)\/restore$/);
    if (restoreMatch && method === "POST") {
      const id = decodeURIComponent(restoreMatch[1]);
      const restored = trash.filter((page) => page.id === id || page.parentId === id);
      trash = trash.filter((page) => !restored.includes(page));
      tree = [...tree, ...restored.map((page) => ({ ...page, deletedAt: null }))];
      return jsonResponse({ restored: restored.map(({ id: pageId }) => pageId) });
    }

    const purgeMatch = url.match(/^\/api\/pages\/([^/]+)\/purge$/);
    if (purgeMatch && method === "DELETE") {
      const id = decodeURIComponent(purgeMatch[1]);
      const purged = trash.filter((page) => page.id === id || page.parentId === id);
      trash = trash.filter((page) => !purged.includes(page));
      return jsonResponse({ purged: purged.map(({ id: pageId }) => pageId) });
    }

    return jsonResponse({ error: "not_found" }, 404);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { requests, fetchMock };
}

function trashRow(title: string) {
  return screen.getByRole("listitem", { name: `Deleted page ${title}` });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/trash");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("trash page", () => {
  it("lists only trashed pages and shows their deletion date and original parent", async () => {
    const livePage = createPage("live-parent", "Live notebook", null, false);
    const deletedPage = createPage("deleted-note", "Deleted draft", "live-parent", true);
    const { requests } = stubApi({ livePages: [livePage], trashedPages: [deletedPage] });

    render(<App />);

    const list = await screen.findByRole("list", { name: "Deleted pages" });
    expect(within(list).getByRole("heading", { level: 2, name: "Deleted draft" })).toBeTruthy();
    expect(within(list).queryByText("Live notebook")).toBeNull();
    expect(within(list).getByText("Originally under Live notebook")).toBeTruthy();
    expect(within(list).getByRole("status").textContent).toBe("Deleted");
    expect(within(list).getByText((_, element) => element?.tagName === "TIME")).toBeTruthy();
    expect(requests).toContainEqual({ url: "/api/pages/trash", method: "GET" });
  });

  it("restores once, removes the row, and refreshes the sidebar tree", async () => {
    const page = createPage("restored-note", "Recovered note", null, true);
    const { requests } = stubApi({ trashedPages: [page] });

    render(<App />);

    const row = await screen.findByRole("listitem", { name: "Deleted page Recovered note" });
    fireEvent.click(within(row).getByRole("button", { name: "Restore" }));

    expect(await screen.findByRole("treeitem", { name: "Recovered note" })).toBeTruthy();
    expect(await screen.findByText("Your trash is empty.")).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: "Deleted page Recovered note" })).toBeNull();
    expect(requests.filter(({ url, method }) => url === "/api/pages/restored-note/restore" && method === "POST"))
      .toHaveLength(1);
    expect(requests.filter(({ url, method }) => url === "/api/pages/tree" && method === "GET"))
      .toHaveLength(2);
  });

  it("opens a named irreversible subtree confirmation without sending a request", async () => {
    const page = createPage("purge-note", "Old notebook", null, true);
    const { requests } = stubApi({ trashedPages: [page] });

    render(<App />);

    const row = await screen.findByRole("listitem", { name: "Deleted page Old notebook" });
    fireEvent.click(within(row).getByRole("button", { name: "Delete permanently" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Delete Old notebook permanently?" });
    expect(dialog.textContent).toContain("Old notebook");
    expect(dialog.textContent).toContain("all pages in its subtree");
    expect(dialog.textContent).toContain("cannot be undone");
    expect(requests.filter(({ method }) => method === "DELETE")).toHaveLength(0);
  });

  it("purges exactly once only after confirmation", async () => {
    const page = createPage("purge-note", "Old notebook", null, true);
    const { requests } = stubApi({ trashedPages: [page] });

    render(<App />);

    const row = await screen.findByRole("listitem", { name: "Deleted page Old notebook" });
    fireEvent.click(within(row).getByRole("button", { name: "Delete permanently" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Old notebook permanently?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    expect(await screen.findByText("Your trash is empty.")).toBeTruthy();
    expect(requests.filter(({ url, method }) => url === "/api/pages/purge-note/purge" && method === "DELETE"))
      .toHaveLength(1);
  });

  it("cancels permanent deletion without a request and leaves the row in place", async () => {
    const page = createPage("keep-note", "Keep this page", null, true);
    const { requests } = stubApi({ trashedPages: [page] });

    render(<App />);

    const row = await screen.findByRole("listitem", { name: "Deleted page Keep this page" });
    fireEvent.click(within(row).getByRole("button", { name: "Delete permanently" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Keep this page permanently?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("listitem", { name: "Deleted page Keep this page" })).toBeTruthy();
    expect(requests.filter(({ url, method }) => url === "/api/pages/keep-note/purge" && method === "DELETE"))
      .toHaveLength(0);
  });

  it("shows an empty state for an empty trash", async () => {
    stubApi();

    render(<App />);

    expect(await screen.findByText("Your trash is empty.")).toBeTruthy();
  });

  it("shows a visible error instead of an empty list when loading trash fails", async () => {
    stubApi({ trashFailure: true });

    render(<App />);

    expect((await screen.findByRole("alert")).textContent).toContain("Could not load trash: trash_unavailable");
    expect(screen.queryByText("Your trash is empty.")).toBeNull();
  });
});
