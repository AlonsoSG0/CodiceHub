import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

type Result = { id: string; title: string; snippet: string };

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function renderPalette() {
  window.history.replaceState({}, "", "/notes");
  return render(<App />);
}

function stubSearch(fetcher: (input: RequestInfo | URL) => Promise<Response> = async () => jsonResponse({ results: [] })) {
  const searchMock = vi.fn(fetcher);
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (String(input) === "/api/pages/tree") return Promise.resolve(jsonResponse({ pages: [] }));
    if (String(input) === "/api/sections") return Promise.resolve(jsonResponse({ sections: [] }));
    return searchMock(input);
  });
  vi.stubGlobal("fetch", fetchMock);
  return searchMock;
}

async function typeAndSearch(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "Search pages" }));
  const input = screen.getByRole("combobox", { name: "Search pages" });
  fireEvent.change(input, { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
  return input;
}

describe("search command palette", () => {
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
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    vi.useFakeTimers();
    stubSearch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/");
  });

  it("opens and focuses from Command+K, closes with Escape, and restores focus", () => {
    renderPalette();
    const trigger = screen.getByRole("button", { name: "Search pages" });
    trigger.focus();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = screen.getByRole("combobox", { name: "Search pages" });
    expect(screen.getByRole("dialog", { name: "Search pages" })).toBeTruthy();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search pages" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("opens from Control+K and toggles closed when the shortcut is pressed again", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Search pages" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: "Search pages" })).toBeNull();
  });

  it("debounces typing into one exact GET request and renders title, snippet, and a marked match", async () => {
    const result: Result = { id: "page-1", title: "Orchard map", snippet: "A note about orchard paths." };
    const fetchMock = stubSearch(async () => jsonResponse({ results: [result] }));
    renderPalette();

    fireEvent.click(screen.getByRole("button", { name: "Search pages" }));
    const input = screen.getByRole("combobox", { name: "Search pages" });
    fireEvent.change(input, { target: { value: "o" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    fireEvent.change(input, { target: { value: "or" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    fireEvent.change(input, { target: { value: "orchard" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(249); });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=orchard");
    const option = screen.getByRole("option");
    expect(option.textContent).toContain("Orchard map");
    expect(option.textContent).toContain("A note about orchard paths.");
    expect(option.querySelector("mark")?.textContent).toBe("Orchard");
  });

  it("renders a matching title and snippet only once", async () => {
    stubSearch(async () => jsonResponse({ results: [{ id: "repeated", title: "Repeated heading", snippet: "Repeated heading" }] }));
    renderPalette();

    await typeAndSearch("notes");

    expect(screen.getByRole("option").textContent).toBe("Repeated heading");
  });

  it("does not let a stale response replace results for the newer query", async () => {
    const pending: Array<{ url: string; resolve: (response: Response) => void }> = [];
    stubSearch((input) => new Promise<Response>((resolve) => {
      pending.push({ url: String(input), resolve });
    }));
    renderPalette();

    fireEvent.click(screen.getByRole("button", { name: "Search pages" }));
    const input = screen.getByRole("combobox", { name: "Search pages" });
    fireEvent.change(input, { target: { value: "older" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    fireEvent.change(input, { target: { value: "newer" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(pending.map(({ url }) => url)).toEqual(["/api/search?q=older", "/api/search?q=newer"]);

    await act(async () => { pending[1]!.resolve(jsonResponse({ results: [{ id: "new", title: "New result", snippet: "Newer note" }] })); });
    expect(screen.getByRole("option").textContent).toContain("New result");
    await act(async () => { pending[0]!.resolve(jsonResponse({ results: [{ id: "old", title: "Old result", snippet: "Older note" }] })); });
    expect(screen.getByRole("option").textContent).toContain("New result");
    expect(screen.queryByText("Old result")).toBeNull();
  });

  it("moves the active option with Up and Down and opens the selected page with Enter", async () => {
    const results: Result[] = [
      { id: "first", title: "First page", snippet: "First snippet" },
      { id: "second", title: "Second page", snippet: "Second snippet" },
    ];
    stubSearch(async () => jsonResponse({ results }));
    renderPalette();
    const input = await typeAndSearch("page");

    expect(screen.getByRole("option", { name: /First page/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Second page/ }).getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe("search-result-second");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(window.location.pathname).toBe("/notes/second");
    expect(screen.queryByRole("dialog", { name: "Search pages" })).toBeNull();
  });

  it("renders request failures as an error and leaves the empty-query hint visible without fetching", async () => {
    const fetchMock = stubSearch(async () => jsonResponse({ error: "internal_error" }, 500));
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "Search pages" }));
    expect(screen.getByText("Type to search your pages.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("combobox", { name: "Search pages" }), { target: { value: "broken" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=broken");
    expect(screen.getByRole("alert").textContent).toBe("Search is unavailable. Try again.");
  });
});
