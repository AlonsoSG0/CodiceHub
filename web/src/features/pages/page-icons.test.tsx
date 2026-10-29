import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

const emojiResolver = vi.hoisted(() => vi.fn(async () => ({ locale: "en", emojis: [], categories: [], skinTones: {} })));

vi.mock("frimousse", async () => {
  const React = await import("react");
  return {
    defaultEmojiDataResolver: emojiResolver,
    EmojiPicker: {
      // Root is the data and selection provider; the list only shows up through Viewport + List.
      Root: ({ onEmojiSelect, children }: { onEmojiSelect?: (emoji: { emoji: string }) => void; children?: unknown }) =>
        React.createElement(
          "div",
          null,
          children as never,
          React.createElement("button", { type: "button", onClick: () => onEmojiSelect?.({ emoji: "📓" }) }, "📓"),
        ),
      Search: () => null,
      Viewport: ({ children }: { children?: unknown }) => React.createElement("div", null, children as never),
      List: () => React.createElement("span", { "data-testid": "emoji-list" }),
    },
  };
});

const iconPage = {
  id: "page-1",
  parentId: null,
  title: "Field notes",
  position: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  content: { type: "doc", content: [{ type: "paragraph" }] },
};

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function renderPage(icon: string | null, patchFails = false) {
  window.history.replaceState({}, "", "/notes/page-1");
  const page = { ...iconPage, icon };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/pages/tree") return jsonResponse({ pages: [page] });
    if (url === "/api/sections") return jsonResponse({ sections: [] });
    if (url === "/api/pages/page-1" && init?.method === "PATCH") {
      return patchFails ? jsonResponse({ error: "internal_error" }, 500) : jsonResponse({ ...page, ...JSON.parse(String(init.body)) });
    }
    if (url === "/api/pages/page-1") return jsonResponse(page);
    return jsonResponse({ error: "not_found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  emojiResolver.mockReset();
  emojiResolver.mockResolvedValue({ locale: "en", emojis: [], categories: [], skinTones: {} });
  window.history.replaceState({}, "", "/");
});

describe("page icons", () => {
  it("renders notebook-text in the sidebar row and title when the stored icon is null", async () => {
    renderPage(null);

    expect(await screen.findAllByLabelText("notebook-text")).toHaveLength(2);
  });

  it("does not load emoji data until the emoji section is opened", async () => {
    renderPage(null);

    await screen.findAllByLabelText("notebook-text");
    expect(emojiResolver).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Change page icon" }));
    expect(emojiResolver).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open emoji picker" }));
    await waitFor(() => expect(emojiResolver).toHaveBeenCalledTimes(1));
  });

  it("keeps title focus when opening and closes the picker on Escape", async () => {
    renderPage(null);
    const title = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.click(screen.getByRole("button", { name: "Change page icon" }));

    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(screen.getByRole("dialog", { name: "Choose page icon" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose page icon" })).toBeNull());
  });

  it("renders a stored emoji in both the sidebar row and title", async () => {
    renderPage("emoji:📓");

    expect(await screen.findAllByLabelText("📓")).toHaveLength(2);
  });

  it("patches a chosen emoji once and updates both places without refetching the tree", async () => {
    const fetchMock = renderPage(null);
    await screen.findAllByLabelText("notebook-text");
    const treeRequestsBefore = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/pages/tree").length;

    fireEvent.click(screen.getByRole("button", { name: "Change page icon" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open emoji picker" }));
    fireEvent.click(await screen.findByRole("button", { name: "📓" }));

    await waitFor(() => expect(screen.getAllByLabelText("📓")).toHaveLength(2));
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.[0]).toBe("/api/pages/page-1");
    expect(JSON.parse(String(patches[0]?.[1]?.body))).toEqual({ icon: "emoji:📓" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/pages/tree")).toHaveLength(treeRequestsBefore);
  });

  it("removes an icon by PATCHing null and returns both locations to notebook-text", async () => {
    const fetchMock = renderPage("emoji:📓");
    await screen.findAllByLabelText("📓");
    fireEvent.click(screen.getByRole("button", { name: "Change page icon" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove icon" }));

    await waitFor(() => {
      expect(screen.getAllByLabelText("notebook-text")).toHaveLength(2);
    });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ icon: null });
  });

  it("shows an unavailable message when emoji data fails to load", async () => {
    emojiResolver.mockRejectedValueOnce(new Error("offline"));
    renderPage(null);
    await screen.findAllByLabelText("notebook-text");
    fireEvent.click(screen.getByRole("button", { name: "Change page icon" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open emoji picker" }));

    expect(await screen.findByText("Emojis are unavailable right now.")).toBeTruthy();
  });

  it("falls back to notebook-text for an icon name outside the curated palette", async () => {
    renderPage("unknown-icon-name");

    expect(await screen.findAllByLabelText("notebook-text")).toHaveLength(2);
  });

  it("falls back to the default for a name inherited from Object instead of rendering it", async () => {
    // A plain object literal answers for "constructor", which used to resolve to Object itself.
    renderPage("constructor");

    expect(await screen.findAllByLabelText("notebook-text")).toHaveLength(2);
  });

  it("shows a save error and keeps the stored icon after a failed patch", async () => {
    const fetchMock = renderPage(null, true);
    await screen.findAllByLabelText("notebook-text");
    fireEvent.click(screen.getByRole("button", { name: "Change page icon" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open emoji picker" }));
    fireEvent.click(await screen.findByRole("button", { name: "📓" }));

    expect((await screen.findByRole("alert")).textContent).toContain("internal_error");
    expect(screen.getByRole("treeitem", { name: "Field notes" }).querySelector('[aria-label="notebook-text"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change page icon" }).querySelector('[aria-label="notebook-text"]')).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  });
});
