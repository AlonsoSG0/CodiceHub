import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/app/theme-provider";
import { addDays, todayKey } from "@/features/habits/date";
import type { HabitEntry } from "@/features/habits/habits-api";
import { BooksPage } from "./books-page";
import type { Book } from "./books-api";

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

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "book-1",
    title: "Piranesi",
    author: "Susanna Clarke",
    score: 8,
    status: "reading",
    startDate: null,
    completedDate: null,
    link: null,
    expectation: null,
    coverUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const readingHabit = {
  id: "reading",
  name: "Reading",
  icon: null,
  position: 0,
  section: "books" as const,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  fields: [
    { id: "done", habitId: "reading", kind: "check" as const, label: "Done", unit: null, target: null, position: 0, archivedAt: null },
    { id: "minutes", habitId: "reading", kind: "number" as const, label: "Minutes", unit: "min", target: null, position: 1, archivedAt: null },
    { id: "pages", habitId: "reading", kind: "text" as const, label: "Pages", unit: null, target: null, position: 2, archivedAt: null },
  ],
};

function entry(date: string, fieldId = "done", value: HabitEntry["value"] = true): HabitEntry {
  const kind = fieldId === "minutes" ? "number" : fieldId === "pages" ? "text" : "check";
  return { habitId: "reading", fieldId, date, kind, value };
}

/** A tiny in-memory server so the page exercises the real client against real request shapes. */
function stubServer(options: {
  books?: Book[];
  entries?: HabitEntry[];
  createFails?: boolean;
  writeFails?: boolean;
  failBooks?: boolean;
} = {}) {
  const books = [...(options.books ?? [makeBook()])];
  const entries = [...(options.entries ?? [])];
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  const writes: Array<{ date: string; fieldId: string; value: unknown }> = [];
  const notebooks: string[] = [];
  let failBooks = options.failBooks ?? false;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ url, method, body });

      if (url === "/api/books" && method === "GET") {
        return failBooks ? json({ error: "books_unavailable" }, 503) : json({ books: [...books] });
      }
      if (url === "/api/uploads" && method === "POST") return json({ url: "/uploads/cover.webp" }, 201);
      if (url.endsWith("/notebook") && method === "POST") {
        notebooks.push(url);
        return json({ id: "n1", bookId: url.split("/")[3]!, content: { type: "doc", content: [] } }, 201);
      }
      if (url === "/api/books" && method === "POST") {
        if (options.createFails) return json({ error: "invalid_title" }, 400);
        const payload = JSON.parse(body ?? "{}") as Partial<Book>;
        const created = makeBook({ id: `book-${books.length + 1}`, ...payload });
        books.push(created);
        return json({ ...created }, 201);
      }
      if (url.startsWith("/api/books/") && method === "PATCH") {
        const id = url.split("/")[3]!;
        const patch = JSON.parse(body ?? "{}") as Partial<Book>;
        const updated = { ...books.find((book) => book.id === id)!, ...patch };
        books.splice(books.findIndex((book) => book.id === id), 1, updated);
        return json({ ...updated });
      }
      if (url.startsWith("/api/books/") && method === "DELETE") {
        const id = url.split("/")[3]!;
        books.splice(books.findIndex((book) => book.id === id), 1);
        return json({ deleted: id });
      }

      if (url.startsWith("/api/habits/entries?") && method === "GET") {
        const query = new URL(url, "http://localhost").searchParams;
        return json({ entries: entries.filter((item) => item.date >= query.get("from")! && item.date <= query.get("to")!) });
      }
      if (url.startsWith("/api/habits/reading/entries/") && method === "PUT") {
        const date = decodeURIComponent(url.split("/").at(-1)!);
        const values = (JSON.parse(body ?? "{}") as { values: Array<{ fieldId: string; value: unknown }> }).values;
        if (options.writeFails) return json({ error: "write_failed" }, 503);
        for (const value of values) {
          writes.push({ date, fieldId: value.fieldId, value: value.value });
          const index = entries.findIndex((item) => item.date === date && item.fieldId === value.fieldId);
          if (value.value === null) {
            if (index >= 0) entries.splice(index, 1);
          } else {
            const next = entry(date, value.fieldId, value.value as HabitEntry["value"]);
            if (index >= 0) entries.splice(index, 1, next);
            else entries.push(next);
          }
        }
        return json({ entries: entries.filter((item) => item.date === date) });
      }
      if (url.startsWith("/api/habits") && method === "GET") return json({ habits: [readingHabit] });
      if (url.startsWith("/api/habits/")) return json(readingHabit);

      return json({ error: "not_found" }, 404);
    }),
  );

  return { books, entries, calls, writes, notebooks, setFailBooks: (value: boolean) => { failBooks = value; } };
}

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}</output>;
}

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <BooksPage />
        <LocationDisplay />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function readingDayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const localDate = new Date(year!, month! - 1, date!, 12);
  return `${new Intl.DateTimeFormat("en", { weekday: "long" }).format(localDate)}, ${new Intl.DateTimeFormat("en", { day: "numeric", month: "long" }).format(localDate)}`;
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BooksPage", () => {
  it("keeps the history, check-in, stats, filters, status and notebook actions available", async () => {
    const year = todayKey().slice(0, 4);
    const server = stubServer({
      books: [
        makeBook(),
        makeBook({ id: "finished", title: "Dune", status: "completed", completedDate: `${year}-03-12`, score: 9.5 }),
        makeBook({ id: "wish", title: "Kindred", status: "wishlist", score: null }),
        makeBook({ id: "abandoned", title: "The Trial", status: "abandoned", score: 6 }),
        makeBook({ id: "older", title: "Older title", status: "completed", completedDate: `${Number(year) - 1}-12-30` }),
      ],
      entries: [entry(todayKey())],
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Books" })).toBeInTheDocument();
    expect(await screen.findByText("5 on the shelf, 1 finished this year")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Books summary" });
    expect(summary).toHaveTextContent("Reading now1");
    expect(summary).toHaveTextContent("Finished");
    expect(summary).toHaveTextContent("Reading streak1 day");

    const history = screen.getByRole("region", { name: "Reading history" });
    const log = screen.getByRole("region", { name: "Today check-ins" });
    expect(history.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.getByRole("group", { name: "History period" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quarter" }));
    expect(screen.getByRole("button", { name: "Quarter" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(await screen.findByRole("list", { name: "Activity by day" })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Piranesi, Reading\. Open details/ })).toHaveTextContent("8");
    expect(screen.getByRole("button", { name: /Dune, Completed\. Open details/ })).toHaveTextContent("9.5");
    expect(screen.getByRole("button", { name: /Open the notebook of Piranesi/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter books by status" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wishlist 1" }));
    expect(screen.getByRole("button", { name: /Kindred, Wishlist\. Open details/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Piranesi, Reading\. Open details/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All 5" }));

    fireEvent.click(screen.getByRole("button", { name: "Open the notebook of Piranesi" }));
    await waitFor(() => expect(server.notebooks).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("current-location")).toHaveTextContent("/books/book-1/notebook"));
    expect(server.notebooks[0]).toContain("/api/books/book-1/notebook");
  });

  it("validates new books and resets the draft when the dialog is reopened", async () => {
    const server = stubServer({ books: [] });
    renderPage();

    expect(await screen.findByRole("button", { name: "Add book" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add book" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Draft title" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Add book" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Title")).toHaveValue("");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add book" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("A book needs a title.");
    expect(server.books).toHaveLength(0);
    expect(server.calls.filter((call) => call.url === "/api/books" && call.method === "POST")).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Dune" } });
    fireEvent.change(within(dialog).getByLabelText("Score"), { target: { value: "11" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add book" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The score must be a number between 0 and 10.");
    expect(server.books).toHaveLength(0);
    expect(server.calls.filter((call) => call.url === "/api/books" && call.method === "POST")).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText("Score"), { target: { value: "8.5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add book" }));
    expect(await screen.findByRole("button", { name: /Dune, Reading\. Open details/ })).toBeInTheDocument();
    expect(server.books).toHaveLength(1);
    expect(server.calls.filter((call) => call.url === "/api/books" && call.method === "POST")).toHaveLength(1);
    expect(server.books[0]?.score).toBe(8.5);
  });

  it("edits a book's status, score and cover while retaining URL and upload cover paths", async () => {
    const server = stubServer();
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Piranesi, Reading\. Open details/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Piranesi");
    expect(within(dialog).getByLabelText("Author")).toHaveValue("Susanna Clarke");
    expect(within(dialog).getByText(/Last edited/)).toBeInTheDocument();
    expect(within(dialog).getByText("Title")).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText("Cover URL"), { target: { value: "https://example.com/cover.jpg" } });
    expect(within(dialog).getByRole("img", { name: "Cover preview for Piranesi" })).toHaveAttribute("src", "https://example.com/cover.jpg");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove cover" }));
    expect(within(dialog).queryByRole("img", { name: "Cover preview for Piranesi" })).not.toBeInTheDocument();

    const upload = within(dialog).getByLabelText("Upload a cover image");
    fireEvent.change(upload, { target: { files: [new File(["cover"], "cover.png", { type: "image/png" })] } });
    expect(await within(dialog).findByRole("img", { name: "Cover preview for Piranesi" })).toHaveAttribute("src", "/uploads/cover.webp");
    expect(server.calls.some((call) => call.url === "/api/uploads" && call.method === "POST")).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove cover" }));

    const status = within(dialog).getByRole("combobox", { name: "Status" });
    fireEvent.click(status);
    const completed = await screen.findByRole("option", { name: "Completed" });
    fireEvent.pointerDown(completed, { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(completed, { button: 0, pointerType: "mouse" });
    fireEvent.click(completed);
    fireEvent.change(within(dialog).getByLabelText("Score"), { target: { value: "9.5" } });
    fireEvent.change(within(dialog).getByLabelText("Cover URL"), { target: { value: "https://example.com/piranesi.jpg" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(server.books[0]).toMatchObject({ status: "completed", score: 9.5, coverUrl: "https://example.com/piranesi.jpg" }));
    const card = screen.getByRole("button", { name: /Piranesi, Completed\. Open details/ });
    expect(card.querySelector("img")).toHaveAttribute("src", "https://example.com/piranesi.jpg");
  });

  it("requires a second confirmation before deleting a book", async () => {
    const server = stubServer();
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Piranesi, Reading\. Open details/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete book" }));
    expect(within(dialog).getByText("This also removes the book's notebook.")).toBeInTheDocument();
    expect(server.books).toHaveLength(1);
    expect(server.calls.filter((call) => call.method === "DELETE")).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel deletion" }));
    expect(within(dialog).queryByRole("button", { name: "Confirm delete" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Cancel deletion" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete book" })).toBeInTheDocument();
    expect(server.books).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete book" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(server.books).toHaveLength(0));
    expect(screen.queryByRole("button", { name: /Piranesi/ })).not.toBeInTheDocument();
  });

  it("records checks, minutes and pages, reverts failed checks and blocks future-day writes", async () => {
    // The day strip renders only the week that contains today, so on a Sunday "tomorrow" falls into the next week and
    // there is no button to click. Pinning the clock to a Wednesday keeps this test about the future-day guard.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0));
    const today = todayKey();
    const server = stubServer();
    renderPage();
    const log = await screen.findByRole("region", { name: "Day check-ins" });

    const done = within(log).getByRole("checkbox", { name: `Reading Done ${today}` });
    fireEvent.click(done);
    await waitFor(() => expect(done).toHaveAttribute("aria-checked", "true"));
    expect(server.entries).toContainEqual(entry(today));

    const minutes = within(log).getByRole("spinbutton", { name: `Reading Minutes ${today}` });
    fireEvent.focus(minutes);
    fireEvent.change(minutes, { target: { value: "25" } });
    fireEvent.keyDown(minutes, { key: "Enter", code: "Enter" });
    fireEvent.blur(minutes);
    await waitFor(() => expect(server.entries).toContainEqual(entry(today, "minutes", 25)));
    expect(server.writes.filter((write) => write.fieldId === "minutes")).toHaveLength(1);

    fireEvent.click(within(log).getByRole("button", { name: "Add note for Reading" }));
    const pages = within(log).getByRole("textbox", { name: `Reading Pages ${today}` });
    fireEvent.change(pages, { target: { value: "Chapter 4" } });
    fireEvent.blur(pages);
    await waitFor(() => expect(server.entries).toContainEqual(entry(today, "pages", "Chapter 4")));

    const beforeFuture = [...server.entries];
    const tomorrow = addDays(today, 1);
    fireEvent.click(screen.getByRole("button", { name: readingDayLabel(tomorrow) }));
    const futureDone = await screen.findByRole("checkbox", { name: `Reading Done ${tomorrow}` });
    expect(futureDone).toBeDisabled();
    expect(within(screen.getByRole("region", { name: "Day check-ins" })).getByRole("spinbutton", { name: `Reading Minutes ${tomorrow}` })).toBeDisabled();
    fireEvent.click(futureDone);
    expect(server.entries).toEqual(beforeFuture);
    expect(server.writes.every((write) => write.date <= today)).toBe(true);
  });

  it("rolls back optimistic check-ins and shows the write failure", async () => {
    const today = todayKey();
    const server = stubServer({ writeFails: true });
    renderPage();
    const log = await screen.findByRole("region", { name: "Day check-ins" });
    const done = within(log).getByRole("checkbox", { name: `Reading Done ${today}` });

    fireEvent.click(done);
    expect(await within(log).findByRole("alert")).toHaveTextContent("write_failed");
    await waitFor(() => expect(done).toHaveAttribute("aria-checked", "false"));
    expect(server.entries).toEqual([]);
  });

  it("shows loading and retries a failed load into the empty history, log and library states", async () => {
    const server = stubServer({ books: [], failBooks: true });
    renderPage();

    expect(screen.getByRole("status", { name: "Loading books" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("books_unavailable");
    server.setFailBooks(false);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText(/No books yet/)).toBeInTheDocument();
    expect(screen.getByText("No reading history in this period yet.")).toBeInTheDocument();
    expect(screen.getByText("Nothing logged for this day yet.")).toBeInTheDocument();
    expect(server.calls.filter((call) => call.url === "/api/books" && call.method === "GET")).toHaveLength(2);
  });
});
