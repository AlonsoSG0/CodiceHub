import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/app/theme-provider";
import { BookNotebookPage } from "./book-notebook-page";

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const book = {
  id: "book-1",
  title: "Piranesi",
  author: "Susanna Clarke",
  score: null,
  status: "reading",
  startDate: null,
  completedDate: null,
  link: null,
  expectation: null,
  coverUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage(notebook: unknown = { type: "doc", content: [] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/books/book-1") return json(book);
      if (url === "/api/books/book-1/notebook") return json({ id: "n1", bookId: "book-1", content: notebook });
      return json({ error: "not_found" }, 404);
    }),
  );

  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/books/book-1/notebook"]}>
        <Routes>
          <Route path="/books/:bookId/notebook" element={<BookNotebookPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("BookNotebookPage", () => {
  it("shows the book identity, autosave status and an editor in the notebook column", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Piranesi" })).toBeInTheDocument();
    expect(await screen.findByText("Susanna Clarke")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Book notebook" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
  });

  it("reports a book whose notebook does not exist yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/books/book-1") return json(book);
        return json({ error: "notebook_not_found" }, 404);
      }),
    );

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/books/book-1/notebook"]}>
          <Routes>
            <Route path="/books/:bookId/notebook" element={<BookNotebookPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(await screen.findByRole("heading", { name: "No notebook yet" })).toBeInTheDocument();
  });

  it("links back to the books section", async () => {
    renderPage();

    const back = await screen.findByRole("link", { name: "Back to Books" });
    expect(back.getAttribute("href")).toBe("/books");
  });
});
