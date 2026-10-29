import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Page, PageMeta, PageSection } from "@/lib/api";
import App from "@/App";
import { Breadcrumb } from "./breadcrumb.js";
import { PageTree } from "./page-tree.js";
import { favouritePages, recentPages } from "./page-shortcuts.js";

function meta(id: string, parentId: string | null, position: number, title = id, sectionId: string | null = null): PageMeta {
  return {
    id,
    parentId,
    title,
    icon: null,
    position,
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    favorite: false,
    sectionId,
  };
}

function page(id: string, parentId: string | null, position: number, title = id): Page {
  return { ...meta(id, parentId, position, title), content: { type: "doc", content: [] } };
}

const pages = [
  meta("alpha", null, 0, "Alpha"),
  meta("beta", null, 1, "Beta"),
  meta("child", "alpha", 0, "Child"),
  meta("leaf", "child", 0, "Leaf"),
];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function stubApi(options: {
  pages?: PageMeta[];
  sections?: PageSection[];
  page?: Page;
  created?: Page;
  duplicate?: Page;
  createdSection?: PageSection;
  movedSections?: PageSection[];
  treeFailure?: "server" | "rejected";
} = {}) {
  const knownPages = options.pages ?? pages;
  const removedSections = new Set<string>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/sections" && init?.method === "POST") {
      return options.createdSection
        ? jsonResponse(options.createdSection, 201)
        : jsonResponse({ error: "invalid_name" }, 400);
    }
    if (url === "/api/sections") {
      return jsonResponse({ sections: (options.sections ?? []).filter((section) => !removedSections.has(section.id)) });
    }
    if (url.startsWith("/api/sections/") && init?.method === "PATCH") {
      const name = (JSON.parse(String(init.body)) as { name: string }).name;
      return jsonResponse({ id: url.slice("/api/sections/".length), name, position: 0 });
    }
    if (url.startsWith("/api/sections/") && url.endsWith("/move") && init?.method === "POST") {
      return jsonResponse({ sections: options.movedSections ?? [] });
    }
    if (url.startsWith("/api/sections/") && init?.method === "DELETE") {
      const id = url.slice("/api/sections/".length);
      removedSections.add(id);
      return jsonResponse({ deleted: id });
    }
    if (url.endsWith("/move") && init?.method === "POST") return jsonResponse({ pages: [] });
    if (url === "/api/pages/tree") {
      if (options.treeFailure === "server") return jsonResponse({ error: "internal_error" }, 500);
      if (options.treeFailure === "rejected") throw new Error("offline");
      return jsonResponse({ pages: knownPages });
    }
    if (url === "/api/pages" && init?.method === "POST") {
      return options.created ? jsonResponse(options.created, 201) : jsonResponse({ error: "missing_created_page" }, 500);
    }
    if (url.endsWith("/duplicate") && init?.method === "POST") {
      return options.duplicate ? jsonResponse(options.duplicate, 201) : jsonResponse({ error: "page_not_found" }, 404);
    }
    if (url.endsWith("/backlinks")) return jsonResponse({ backlinks: [] });
    const id = url.slice("/api/pages/".length);
    if (init?.method === "PATCH") {
      const base = knownPages.find((candidate) => candidate.id === id);
      if (!base) return jsonResponse({ error: "page_not_found" }, 404);
      const patch = JSON.parse(String(init.body)) as Partial<PageMeta>;
      return jsonResponse({ ...base, ...patch, content: { type: "doc", content: [] } });
    }
    if (options.page?.id === id) return jsonResponse(options.page);
    if (options.created?.id === id) return jsonResponse(options.created);
    if (options.duplicate?.id === id) return jsonResponse(options.duplicate);
    return jsonResponse({ error: "page_not_found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setPath(path: string) {
  window.history.replaceState({}, "", path);
}

beforeEach(() => {
  const storageValues = new Map<string, string>();
  const testStorage: Storage = {
    get length() {
      return storageValues.size;
    },
    clear: () => storageValues.clear(),
    getItem: (key) => storageValues.get(key) ?? null,
    key: (index) => [...storageValues.keys()][index] ?? null,
    removeItem: (key) => storageValues.delete(key),
    setItem: (key, value) => storageValues.set(String(key), String(value)),
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: testStorage });

  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("page sidebar and page view", () => {
  it("renders nested treeitems with depth, expansion, and selected semantics", async () => {
    setPath("/notes/leaf");
    stubApi({ page: page("leaf", "child", 0, "Leaf") });

    render(<App />);

    const tree = await screen.findByRole("tree", { name: "Pages" });
    await screen.findByRole("treeitem", { name: "Leaf" });
    const items = await screen.findAllByRole("treeitem");
    expect(tree).toBeTruthy();
    expect(items).toHaveLength(4);
    expect(screen.getByRole("treeitem", { name: /Alpha/ }).getAttribute("aria-level")).toBe("1");
    expect(screen.getByRole("treeitem", { name: /Child/ }).getAttribute("aria-level")).toBe("2");
    expect(screen.getByRole("treeitem", { name: /Leaf/ }).getAttribute("aria-level")).toBe("3");
    expect(screen.getByRole("treeitem", { name: /Alpha/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("treeitem", { name: /Child/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("treeitem", { name: /Beta/ }).hasAttribute("aria-expanded")).toBe(false);
    expect(screen.getByRole("treeitem", { name: /Leaf/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("collapses descendants and restores them when expanded again", async () => {
    setPath("/notes");
    stubApi();
    render(<App />);

    await screen.findByRole("tree");
    fireEvent.click(screen.getByRole("button", { name: "Expand Alpha" }));
    expect(await screen.findByRole("treeitem", { name: /Child/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Alpha" }));
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: /Child/ })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Expand Alpha" }));
    expect(await screen.findByRole("treeitem", { name: /Child/ })).toBeTruthy();
  });

  it("auto-expands the active page's ancestor chain when the tree arrives", async () => {
    setPath("/notes/leaf");
    stubApi({ page: page("leaf", "child", 0, "Leaf") });
    render(<App />);

    expect(await screen.findByRole("treeitem", { name: /Leaf/ })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: /Alpha/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("treeitem", { name: /Child/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("creates a root page with the exact body and navigates to it", async () => {
    setPath("/notes");
    const created = page("new-root", null, 2, "New note");
    const fetchMock = stubApi({ created });
    render(<App />);

    fireEvent.click(
      within(screen.getByRole("complementary", { name: "Workspace sidebar" })).getByRole("button", { name: "New page" }),
    );

    await waitFor(() => expect(window.location.pathname).toBe("/notes/new-root"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/pages");
    expect(post?.[1]?.body).toBe(JSON.stringify({ parentId: null }));
  });

  it("creates a root page from the notes index itself", async () => {
    setPath("/notes");
    const created = page("from-index", null, 2, "From the index");
    const fetchMock = stubApi({ created });
    render(<App />);

    fireEvent.click(
      await within(screen.getByRole("main", { name: "Main canvas" })).findByRole("button", { name: "New page" }),
    );

    await waitFor(() => expect(window.location.pathname).toBe("/notes/from-index"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[1]?.body).toBe(JSON.stringify({ parentId: null }));
  });

  it("creates a subpage under the selected row and navigates to it", async () => {
    setPath("/notes");
    const created = page("new-child", "alpha", 1, "New subpage");
    const fetchMock = stubApi({ created });
    render(<App />);

    await screen.findByRole("tree");
    fireEvent.click(screen.getByRole("button", { name: "Create subpage under Alpha" }));

    await waitFor(() => expect(window.location.pathname).toBe("/notes/new-child"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/pages");
    expect(post?.[1]?.body).toBe(JSON.stringify({ parentId: "alpha" }));
  });

  it("shows the breadcrumb ancestors as links and the current page as text", () => {
    render(
      <MemoryRouter>
        <Breadcrumb pages={pages} pageId="leaf" section="Notes" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Alpha" }).getAttribute("href")).toBe("/notes/alpha");
    expect(screen.getByRole("link", { name: "Child" }).getAttribute("href")).toBe("/notes/child");
    expect(screen.getByText("Leaf").closest("a")).toBeNull();
    expect(screen.getByText("Leaf").getAttribute("aria-current")).toBe("page");
  });

  it.each(["server", "rejected"] as const)("shows a visible tree error when fetchTree is %s", async (failure) => {
    setPath("/notes");
    stubApi({ treeFailure: failure });
    render(<App />);

    const alert = await within(screen.getByRole("complementary", { name: "Workspace sidebar" })).findByRole("alert");
    expect(alert.textContent).toMatch(/page tree|tree|load/i);
  });

  it("offers the markdown download from the toolbar page menu", async () => {
    setPath("/notes/leaf");
    stubApi({ page: page("leaf", "child", 0, "Leaf") });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Page actions" }));

    const link = (await screen.findByText("Export as Markdown")).closest("a");
    expect(link?.getAttribute("href")).toBe("/api/pages/leaf/export.md");
    expect(link?.hasAttribute("download")).toBe(true);
  });

  it("offers every page action in the toolbar menu and duplicates the page from it", async () => {
    setPath("/notes/leaf");
    const copy = page("leaf-copy", "child", 1, "Leaf (copy)");
    const fetchMock = stubApi({ page: page("leaf", "child", 0, "Leaf"), duplicate: copy });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Page actions" }));

    expect(await screen.findByText("Duplicate")).toBeTruthy();
    expect(screen.getByText("Add to favourites")).toBeTruthy();
    expect(screen.getByText("Move to…")).toBeTruthy();
    expect(screen.getByText("Copy link")).toBeTruthy();
    expect(screen.getByText("Move to trash")).toBeTruthy();
    expect(screen.getByText(/^Edited /)).toBeTruthy();

    fireEvent.click(screen.getByText("Duplicate"));

    await waitFor(() => expect(window.location.pathname).toBe("/notes/leaf-copy"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pages/leaf/duplicate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("updates the sidebar label while the page title is being typed", async () => {
    setPath("/notes/leaf");
    stubApi({ page: page("leaf", "child", 0, "Leaf") });
    render(<App />);

    const title = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(title, { target: { value: "Leaf renamed" } });

    await waitFor(() => expect(screen.getByRole("treeitem", { name: "Leaf renamed" })).toBeTruthy());
  });

  it("shows the edited page as the most recent one back on the notes index", async () => {
    setPath("/notes/leaf");
    const fetchMock = stubApi({ page: page("leaf", "child", 0, "Leaf") });
    render(<App />);

    const title = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(title, { target: { value: "Leaf renamed" } });

    await waitFor(
      () => expect(fetchMock).toHaveBeenCalledWith("/api/pages/leaf", expect.objectContaining({ method: "PATCH" })),
      { timeout: 2000 },
    );
    fireEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Notes" }));

    const list = await screen.findByRole("list", { name: "Pages" });
    const rows = within(list).getAllByRole("link");
    expect(rows[0]?.textContent).toContain("Leaf renamed");
    expect(rows[0]?.textContent).toContain("Just now");
  });

  it("loads an editable title and inviting editor while keeping its breadcrumb in the canvas header", async () => {
    setPath("/notes/leaf");
    stubApi({ page: page("leaf", "child", 0, "Leaf") });
    render(<App />);

    const title = await screen.findByRole("textbox", { name: "Page title" });
    expect((title as HTMLInputElement).value).toBe("Leaf");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Alpha" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Child" })).toBeTruthy();
    expect(screen.getByText("Idle")).toBeTruthy();
    expect(screen
      .getByRole("textbox", { name: "Page content" })
      .querySelector("p")
      ?.getAttribute("data-placeholder")).toBe("Start writing, or type / for a command…");
  });

  it("shows a visible error when the requested page is not found", async () => {
    setPath("/notes/missing");
    stubApi({ pages });
    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("page_not_found");
  });

  it("opens the nested page that was clicked instead of its ancestor", async () => {
    setPath("/notes/alpha");
    stubApi({ page: page("alpha", null, 0, "Alpha") });
    render(<App />);

    await screen.findByRole("treeitem", { name: /Alpha/ });
    fireEvent.click(screen.getByRole("button", { name: "Expand Alpha" }));
    const child = await screen.findByRole("treeitem", { name: /Child/ });

    fireEvent.click(within(child).getByText("Child"));

    await waitFor(() => expect(window.location.pathname).toBe("/notes/child"));
  });

  it("opens the page menu with rename, trash and copy link", async () => {
    render(
      <MemoryRouter>
        <PageTree
          pages={pages}
          sectionId={null}
          draggedId={null}
          activeId={null}
          onCreateSubpage={() => undefined}
          onRenamePage={vi.fn()}
          onTrashPage={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions for Alpha" }));

    expect(await screen.findByText("Rename")).toBeTruthy();
    expect(screen.getByText("Move to trash")).toBeTruthy();
    expect(screen.getByText("Copy link")).toBeTruthy();
  });

  it("renames, trashes and copies the link of the page whose menu was opened", async () => {
    const onRenamePage = vi.fn();
    const onTrashPage = vi.fn();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <MemoryRouter>
        <PageTree
          pages={pages}
          sectionId={null}
          draggedId={null}
          activeId={null}
          onCreateSubpage={() => undefined}
          onRenamePage={onRenamePage}
          onTrashPage={onTrashPage}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions for Alpha" }));
    fireEvent.click(await screen.findByText("Move to trash"));
    expect(onTrashPage).toHaveBeenCalledWith("alpha");

    fireEvent.click(screen.getByRole("button", { name: "More actions for Alpha" }));
    fireEvent.click(await screen.findByText("Rename"));
    expect(onRenamePage).toHaveBeenCalledWith("alpha");

    fireEvent.click(screen.getByRole("button", { name: "More actions for Alpha" }));
    fireEvent.click(await screen.findByText("Copy link"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/notes/alpha`));

    Reflect.deleteProperty(window.navigator, "clipboard");
  });

  it("favourites a page from its row menu and shows it on the Favourites shelf", async () => {
    setPath("/notes");
    const fetchMock = stubApi();
    render(<App />);

    await screen.findByRole("tree");
    fireEvent.click(screen.getByRole("button", { name: "More actions for Alpha" }));
    fireEvent.click(await screen.findByText("Add to favourites"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pages/alpha",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ favorite: true }) }),
      ),
    );
    const shelf = await screen.findByRole("list", { name: "Favourites" });
    expect(within(shelf).getByRole("link", { name: "Alpha" })).toBeTruthy();
  });

  it("remembers which pages were expanded across a reload", async () => {
    setPath("/notes");
    stubApi();
    const first = render(<App />);

    await screen.findByRole("tree");
    fireEvent.click(screen.getByRole("button", { name: "Expand Alpha" }));
    await screen.findByRole("treeitem", { name: /Child/ });
    first.unmount();

    render(<App />);
    expect(await screen.findByRole("treeitem", { name: /Child/ })).toBeTruthy();
  });

  it("moves a page from the row menu without a drag, offering only valid destinations", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/pages/alpha/move") return jsonResponse({ pages: [meta("alpha", "beta", 0, "Alpha")] });
      return jsonResponse({ error: "page_not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPageTree(pages);

    fireEvent.click(screen.getByRole("button", { name: "More actions for Alpha" }));
    fireEvent.click(await screen.findByText("Move to…"));

    const destinations = await screen.findByRole("listbox", { name: "Destinations" });
    expect(within(destinations).queryByRole("option", { name: /Alpha/ })).toBeNull();
    expect(within(destinations).queryByRole("option", { name: /Child|Leaf/ })).toBeNull();

    fireEvent.click(within(destinations).getByRole("option", { name: /Beta/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pages/alpha/move",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ parentId: "beta", position: 0 }),
        }),
      ),
    );
  });

  it("closes the mobile drawer as soon as a page is chosen", async () => {
    setPath("/notes");
    stubApi();
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Menu" }));
    const shell = () => document.querySelector(".workspace-shell");
    expect(shell()?.getAttribute("data-mobile-open")).toBe("true");

    const tree = await screen.findByRole("tree");
    fireEvent.click(within(tree).getByRole("treeitem", { name: "Alpha" }));

    await waitFor(() => expect(shell()?.getAttribute("data-mobile-open")).toBe("false"));
  });

  it("keeps recents off a short workspace and out of the favourites shelf", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      ...meta(`page-${index}`, null, index, `Page ${index}`),
      updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));

    expect(recentPages(many)).toHaveLength(5);
    expect(recentPages(many)[0]?.id).toBe("page-9");
    expect(recentPages(many.slice(0, 8))).toEqual([]);

    const withFavourite = many.map((entry) => (entry.id === "page-9" ? { ...entry, favorite: true } : entry));
    expect(favouritePages(withFavourite).map(({ id }) => id)).toEqual(["page-9"]);
    expect(recentPages(withFavourite)[0]?.id).toBe("page-8");
  });

  it("supports arrow navigation, expansion, and Enter activation from the keyboard", async () => {
    setPath("/notes");
    stubApi({ page: page("alpha", null, 0, "Alpha") });
    render(<App />);

    const alpha = await screen.findByRole("treeitem", { name: /Alpha/ });
    alpha.focus();
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(await screen.findByRole("treeitem", { name: /Child/ })).toBeTruthy();
    fireEvent.keyDown(alpha, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: /Child/ })).toBeNull());
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(await screen.findByRole("treeitem", { name: /Child/ })).toBeTruthy();

    fireEvent.keyDown(alpha, { key: "ArrowDown" });
    const child = screen.getByRole("treeitem", { name: /Child/ });
    expect(document.activeElement).toBe(child);
    fireEvent.keyDown(child, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(alpha);
    fireEvent.keyDown(alpha, { key: "Enter" });

    await waitFor(() => expect(window.location.pathname).toBe("/notes/alpha"));
  });
});

describe("sidebar shelves", () => {
  const reading: PageSection = { id: "reading", name: "Reading", position: 0 };

  it("renders one tree per shelf and keeps every page on its own shelf", async () => {
    setPath("/notes");
    stubApi({
      pages: [meta("alpha", null, 0, "Alpha"), meta("book", null, 0, "Book notes", "reading")],
      sections: [reading],
    });
    render(<App />);

    const defaultTree = await screen.findByRole("tree", { name: "Pages" });
    expect(within(defaultTree).getByRole("treeitem", { name: "Alpha" })).toBeTruthy();
    expect(within(defaultTree).queryByRole("treeitem", { name: "Book notes" })).toBeNull();

    const shelfTree = screen.getByRole("tree", { name: "Reading" });
    expect(within(shelfTree).getByRole("treeitem", { name: "Book notes" })).toBeTruthy();
  });

  it("creates a page inside a shelf from its heading", async () => {
    setPath("/notes");
    const created = page("in-shelf", null, 0, "In shelf");
    const fetchMock = stubApi({ sections: [reading], created });
    render(<App />);

    await screen.findByRole("tree", { name: "Reading" });
    fireEvent.click(screen.getByRole("button", { name: "New page in Reading" }));

    await waitFor(() => expect(window.location.pathname).toBe("/notes/in-shelf"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[1]?.body).toBe(JSON.stringify({ parentId: null, sectionId: "reading" }));
  });

  it("creates a shelf and names it inline", async () => {
    setPath("/notes");
    const fetchMock = stubApi({ createdSection: { id: "reading", name: "New section", position: 0 } });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "New section" }));
    const input = await screen.findByRole("textbox", { name: "Rename New section" });
    fireEvent.change(input, { target: { value: "Reading" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sections/reading",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Reading" }) }),
      ),
    );
    expect(await screen.findByRole("tree", { name: "Reading" })).toBeTruthy();
  });

  it("deletes a shelf without touching its pages", async () => {
    setPath("/notes");
    const fetchMock = stubApi({
      pages: [meta("book", null, 0, "Book notes", "reading")],
      sections: [reading],
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Reading" }));
    fireEvent.click(await screen.findByText("Delete shelf"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sections/reading",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(screen.queryByRole("tree", { name: "Reading" })).toBeNull();
  });

  it("reorders shelves with Move up and Move down", async () => {
    setPath("/notes");
    const reading: PageSection = { id: "reading", name: "Reading", position: 0 };
    const work: PageSection = { id: "work", name: "Work", position: 1 };
    const fetchMock = stubApi({
      pages: [],
      sections: [reading, work],
      movedSections: [{ ...work, position: 0 }, { ...reading, position: 1 }],
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Work" }));
    fireEvent.click(await screen.findByText("Move up"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sections/work/move",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ position: 0 }) }),
      ),
    );

    const headings = await screen.findAllByText(/^(Reading|Work)$/);
    expect(headings.map((node) => node.textContent)).toEqual(["Work", "Reading"]);
  });

  it("offers the shelves as destinations when a page moves", async () => {
    setPath("/notes");
    const fetchMock = stubApi({
      pages: [meta("alpha", null, 0, "Alpha")],
      sections: [reading],
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "More actions for Alpha" }));
    fireEvent.click(await screen.findByText("Move to…"));

    const destinations = await screen.findByRole("listbox", { name: "Destinations" });
    fireEvent.click(within(destinations).getByRole("option", { name: /Reading/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pages/alpha/move",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ parentId: null, position: 0, sectionId: "reading" }),
        }),
      ),
    );
  });
});

function dataTransfer(): DataTransfer {
  return {
    setData: vi.fn(),
    getData: vi.fn(),
    effectAllowed: "move",
    dropEffect: "move",
  } as unknown as DataTransfer;
}

function renderPageTree(pages: PageMeta[], activeId: string | null = null) {
  function Harness() {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    return (
      <PageTree
        pages={pages}
        sectionId={null}
        activeId={activeId}
        draggedId={draggedId}
        onCreateSubpage={() => undefined}
        onDragPage={setDraggedId}
      />
    );
  }

  return render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
}

function treeOrder(): Array<{ id: string | null; level: string | null }> {
  return screen.getAllByRole("treeitem").map((item) => ({
    id: item.getAttribute("aria-label"),
    level: item.getAttribute("aria-level"),
  }));
}

describe("page tree moves", () => {
  it("shows the root drop hint only during an active drag", () => {
    renderPageTree([meta("alpha", null, 0, "Alpha")]);

    expect(screen.queryByText("Drop at root level")).toBeNull();

    const alpha = screen.getByRole("treeitem", { name: "Alpha" });
    fireEvent.dragStart(alpha, { dataTransfer: dataTransfer() });

    const hint = screen.getByText("Drop at root level");
    expect(window.getComputedStyle(hint).display).not.toBe("none");
    expect(window.getComputedStyle(hint).visibility).toBe("visible");

    fireEvent.dragEnd(alpha);
    expect(screen.queryByText("Drop at root level")).toBeNull();
  });

  it("posts one exact move request and applies only the returned rows", async () => {
    const original = [meta("alpha", null, 0, "Alpha"), meta("beta", null, 1, "Beta")];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ pages: [meta("beta", null, 0, "Beta"), meta("alpha", null, 1, "Alpha")] }));
    vi.stubGlobal("fetch", fetchMock);
    renderPageTree(original);

    const beta = screen.getByRole("treeitem", { name: "Beta" });
    const alpha = screen.getByRole("treeitem", { name: "Alpha" });
    fireEvent.dragStart(beta, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(alpha, { clientY: 1, dataTransfer: dataTransfer() });
    expect(alpha.getAttribute("data-drop-intent")).toBe("before");
    fireEvent.drop(alpha, { clientY: 1, dataTransfer: dataTransfer() });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pages/beta/move",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: null, position: 0 }),
      }),
    );
    await waitFor(() => expect(treeOrder()).toEqual([{ id: "Beta", level: "1" }, { id: "Alpha", level: "1" }]));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/pages/beta/move"]);
  });

  it("moves a nested page to the root when it is dropped in the empty area below the rows", async () => {
    const original = [meta("alpha", null, 0, "Alpha"), meta("child", "alpha", 0, "Child")];
    const fetchMock = vi.fn(async () => jsonResponse({ pages: [meta("child", null, 1, "Child")] }));
    vi.stubGlobal("fetch", fetchMock);
    renderPageTree(original, "child");

    const child = screen.getByRole("treeitem", { name: "Child" });
    fireEvent.dragStart(child, { dataTransfer: dataTransfer() });
    const tree = screen.getByRole("tree", { name: "Pages" });
    fireEvent.dragOver(tree, { dataTransfer: dataTransfer() });
    fireEvent.drop(tree, { dataTransfer: dataTransfer() });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/pages/child/move",
      expect.objectContaining({ body: JSON.stringify({ parentId: null, position: 1 }) }),
    ));
    await waitFor(() => expect(treeOrder()).toEqual([
      { id: "Alpha", level: "1" },
      { id: "Child", level: "1" },
    ]));
  });

  it("supports dropping onto the visible root-level drop target", async () => {
    const original = [meta("alpha", null, 0, "Alpha"), meta("folder", null, 1, "Folder"), meta("child", "folder", 0, "Child")];
    const fetchMock = vi.fn(async () => jsonResponse({ pages: [meta("child", null, 2, "Child")] }));
    vi.stubGlobal("fetch", fetchMock);
    renderPageTree(original, "child");

    const child = screen.getByRole("treeitem", { name: "Child" });
    fireEvent.dragStart(child, { dataTransfer: dataTransfer() });
    const rootTarget = screen.getByRole("group", { name: "Root-level drop target" });
    fireEvent.dragOver(rootTarget, { dataTransfer: dataTransfer() });
    fireEvent.drop(rootTarget, { dataTransfer: dataTransfer() });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/pages/child/move",
      expect.objectContaining({ body: JSON.stringify({ parentId: null, position: 2 }) }),
    ));
    await waitFor(() => expect(treeOrder()).toEqual([
      { id: "Alpha", level: "1" },
      { id: "Folder", level: "1" },
      { id: "Child", level: "1" },
    ]));
  });

  it("shows a distinct nest preview on an expanded target", () => {
    const original = [meta("source", null, 0, "Source"), meta("target", null, 1, "Target"), meta("child", "target", 0, "Child")];
    renderPageTree(original, "child");

    const source = screen.getByRole("treeitem", { name: "Source" });
    const target = screen.getByRole("treeitem", { name: "Target" });
    fireEvent.dragStart(source, { dataTransfer: dataTransfer() });
    const event = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientY: { value: 15 },
      dataTransfer: { value: dataTransfer() },
    });
    fireEvent(target, event);

    expect(target.getAttribute("data-drop-intent")).toBe("onto");
    expect(target.querySelector('[role="group"]')?.getAttribute("data-expanded-drop-target")).toBe("true");
  });

  it("leaves the tree unchanged and announces a failed move", async () => {
    const original = [meta("alpha", null, 0, "Alpha"), meta("beta", null, 1, "Beta")];
    const fetchMock = vi.fn(async () => jsonResponse({ error: "cannot_move_into_descendant" }, 400));
    vi.stubGlobal("fetch", fetchMock);
    renderPageTree(original);
    const before = treeOrder();

    const beta = screen.getByRole("treeitem", { name: "Beta" });
    const alpha = screen.getByRole("treeitem", { name: "Alpha" });
    fireEvent.dragStart(beta, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(alpha, { clientY: 1, dataTransfer: dataTransfer() });
    fireEvent.drop(alpha, { clientY: 1, dataTransfer: dataTransfer() });

    expect((await screen.findByRole("alert")).textContent).toContain("cannot_move_into_descendant");
    expect(treeOrder()).toEqual(before);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: "Alt+ArrowUp",
      pages: [meta("alpha", null, 0, "Alpha"), meta("beta", null, 1, "Beta"), meta("gamma", null, 2, "Gamma")],
      pageId: "beta",
      key: "ArrowUp",
      body: { parentId: null, position: 0 },
      response: [meta("beta", null, 0, "Beta"), meta("alpha", null, 1, "Alpha")],
      order: [{ id: "Beta", level: "1" }, { id: "Alpha", level: "1" }, { id: "Gamma", level: "1" }],
    },
    {
      label: "Alt+ArrowDown",
      pages: [meta("alpha", null, 0, "Alpha"), meta("beta", null, 1, "Beta"), meta("gamma", null, 2, "Gamma")],
      pageId: "alpha",
      key: "ArrowDown",
      body: { parentId: null, position: 1 },
      response: [meta("beta", null, 0, "Beta"), meta("alpha", null, 1, "Alpha")],
      order: [{ id: "Beta", level: "1" }, { id: "Alpha", level: "1" }, { id: "Gamma", level: "1" }],
    },
    {
      label: "Alt+ArrowRight",
      pages: [meta("alpha", null, 0, "Alpha"), meta("beta", null, 1, "Beta"), meta("gamma", null, 2, "Gamma")],
      pageId: "beta",
      key: "ArrowRight",
      body: { parentId: "alpha", position: 0 },
      response: [meta("beta", "alpha", 0, "Beta")],
      order: [{ id: "Alpha", level: "1" }, { id: "Beta", level: "2" }, { id: "Gamma", level: "1" }],
    },
    {
      label: "Alt+ArrowLeft",
      pages: [
        meta("root", null, 0, "Root"),
        meta("middle", "root", 0, "Middle"),
        meta("leaf", "middle", 0, "Leaf"),
        meta("other", "root", 1, "Other"),
      ],
      pageId: "leaf",
      key: "ArrowLeft",
      body: { parentId: "root", position: 1 },
      response: [meta("leaf", "root", 1, "Leaf"), meta("other", "root", 2, "Other")],
      order: [
        { id: "Root", level: "1" },
        { id: "Middle", level: "2" },
        { id: "Leaf", level: "2" },
        { id: "Other", level: "2" },
      ],
    },
  ])("moves with $label using the shared request contract", async ({ pages, pageId, key, body, response, order }) => {
    const fetchMock = vi.fn(async () => jsonResponse({ pages: response }));
    vi.stubGlobal("fetch", fetchMock);
    renderPageTree(pages, pageId);

    const row = screen.getByRole("treeitem", { name: pages.find((item) => item.id === pageId)?.title });
    row.focus();
    fireEvent.keyDown(row, { key, altKey: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/pages/${pageId}/move`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    await waitFor(() => expect(treeOrder()).toEqual(order));
  });
});
