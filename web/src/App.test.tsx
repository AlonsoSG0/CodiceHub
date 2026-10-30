import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.js";
import { resetPreferenceCache } from "@/features/settings/preferences";

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
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
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  storageValues.clear();
  // The preference store caches device values at module level, so clearing storage alone would let one case
  // decide the next one: without this reset, "applies a stored theme on mount" passes on leftover state.
  resetPreferenceCache();
  Object.defineProperty(window, "localStorage", { configurable: true, value: testStorage });
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.style.colorScheme = "";
  window.history.replaceState({}, "", "/");
});

describe("app shell", () => {
  it("keeps Undo and Redo out of routes without a page editor", () => {
    window.history.replaceState({}, "", "/notes");
    render(<App />);

    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
  });

  it("renders the workspace sidebar and main canvas landmarks", () => {
    window.history.replaceState({}, "", "/notes");
    render(<App />);

    expect(screen.getByRole("complementary", { name: "Workspace sidebar" })).toBeTruthy();
    expect(screen.getByRole("main", { name: "Main canvas" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My workspace" }).getAttribute("href")).toBe("/");
    expect(
      within(screen.getByRole("complementary", { name: "Workspace sidebar" })).getByRole("button", { name: "New page" }),
    ).toBeTruthy();
  });

  it("offers one home affordance in the notes sidebar", () => {
    window.history.replaceState({}, "", "/notes");
    render(<App />);

    expect(screen.getByRole("link", { name: "My workspace" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: "Go to Home" })).toBeNull();
  });

  it("keeps search and new page on one sidebar row, shows its keyboard hint, and leaves the toolbar to the display controls", () => {
    window.history.replaceState({}, "", "/notes");
    render(<App />);

    const search = screen.getByRole("button", { name: "Search pages" });
    const sidebar = screen.getByRole("complementary", { name: "Workspace sidebar" });
    const toolbar = document.querySelector(".canvas-toolbar-end") as HTMLElement;
    const toolbarLabels = [...toolbar.querySelectorAll("button")].map(
      (button) => button.getAttribute("aria-label") ?? button.textContent?.trim(),
    );

    expect(search.textContent).toContain("Search");
    expect(search.textContent).toContain("Ctrl K");
    expect(sidebar.contains(search)).toBe(true);
    expect(toolbar.contains(search)).toBe(false);
    expect(within(sidebar).getByRole("button", { name: "New page" })).toBeTruthy();
    // No page is open on the index, so the page menu and the history controls do not render at all: the toolbar holds
    // the two display switches and nothing else.
    expect(toolbarLabels).toHaveLength(2);
    expect(toolbarLabels).toEqual([
      expect.stringMatching(/^Switch to ((dark|light) mode|Atripp theme)$/),
      expect.stringMatching(/^Switch to (Spanish|English)$/),
    ]);
  });

  it("toggles the theme class and persists the selected theme", () => {
    window.history.replaceState({}, "", "/notes");
    render(<App />);

    // A fresh profile lands on atripp now, so the first step of the cycle is light.
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("chub.settings") ?? "{}")).toMatchObject({ "appearance.theme": "light" });
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
    // The toggle is icon only; its accessible name carries the meaning.
    expect(screen.getByRole("button", { name: "Switch to dark mode" }).textContent).toBe("");
  });

  it("applies a stored theme when the app mounts", () => {
    window.localStorage.setItem("chub-theme", "dark");
    window.history.replaceState({}, "", "/notes");

    render(<App />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Switch to Atripp theme" })).toBeTruthy();
  });

  it("renders Home without notes chrome", () => {
    render(<App />);

    expect(screen.getByRole("main")).not.toHaveAttribute("aria-label", "Main canvas");
    expect(screen.queryByRole("complementary", { name: "Workspace sidebar" })).toBeNull();
    expect(document.querySelector(".canvas-toolbar")).toBeNull();
    expect(screen.getByRole("note", { name: "[ Welcome home ]" })).toBeTruthy();
  });

  it("uses the dock Notes entry to open notes with the shell chrome", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Notes" }));

    expect(window.location.pathname).toBe("/notes");
    expect(screen.getByRole("complementary", { name: "Workspace sidebar" })).toBeTruthy();
    expect(document.querySelector(".canvas-toolbar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("renders the trash page at /trash", async () => {
    window.history.replaceState({}, "", "/trash");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ pages: [] }))));

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Trash" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Trash" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
  });

  it("lists the workspace pages with their trail at /notes", async () => {
    window.history.replaceState({}, "", "/notes");
    const now = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              pages: [
                { id: "root", parentId: null, title: "Weekly review", icon: null, position: 0, updatedAt: now, deletedAt: null },
                { id: "child", parentId: "root", title: "Garden plans", icon: "star", position: 0, updatedAt: now, deletedAt: null },
              ],
            }),
          ),
      ),
    );

    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Notes" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: /Garden plans/ })).toBeTruthy();
    expect(screen.getByText("2 pages · 2 edited today")).toBeTruthy();
    expect(within(screen.getByRole("main")).getByRole("link", { name: /^Weekly review/ })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter pages" }), { target: { value: "garden" } });
    const list = screen.getByRole("list", { name: "Pages" });
    expect(within(list).queryByRole("link", { name: /^Weekly review/ })).toBeNull();
    expect(within(list).getAllByRole("link")).toHaveLength(1);
  });

  it("offers the first page when the workspace is empty", async () => {
    window.history.replaceState({}, "", "/notes");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ pages: [] }))));

    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Notes" })).toBeTruthy();
    expect(await screen.findByText("Create a page and it will appear here, newest first.")).toBeTruthy();
  });

  it("renders a page surface placeholder at /notes/:id", () => {
    window.history.replaceState({}, "", "/notes/note-42");

    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Page placeholder" })).toBeTruthy();
    expect(screen.getByText("Page ID: note-42")).toBeTruthy();
  });

  it("redirects an old /p/:id link to the canonical notes page", async () => {
    window.history.replaceState({}, "", "/p/note-42");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ pages: [] }))));

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Page placeholder" })).toBeTruthy();
    expect(window.location.pathname).toBe("/notes/note-42");
  });
});
