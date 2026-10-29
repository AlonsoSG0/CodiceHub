import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import type { Book } from "../src/books/repository.js";
import { app } from "../src/app.js";

const missingId = "00000000-0000-4000-8000-000000000000";

async function expectJson(response: Response, status: number, body: unknown): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await response.text()).toBe(JSON.stringify(body));
}

async function expectBook(response: Response, status: number, expected: Partial<Book> = {}): Promise<Book> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const book = (await response.json()) as Book;
  expect(Object.keys(book)).toEqual([
    "id",
    "title",
    "author",
    "score",
    "status",
    "startDate",
    "completedDate",
    "link",
    "expectation",
    "coverUrl",
    "createdAt",
    "updatedAt",
  ]);
  expect(book.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(book).toMatchObject(expected);
  return book;
}

describe("books HTTP API", () => {
  let db: ChubDatabase;
  let api: { request: (input: string, init?: RequestInit) => Promise<Response> };

  const post = (path: string, body: unknown): Promise<Response> =>
    api.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const patch = (path: string, body: unknown): Promise<Response> =>
    api.request(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    db = createDb(join(mkdtempSync(join(tmpdir(), "chub-books-api-")), "chub.db"));
    api = { request: (input, init) => app.request(input, init, { db }) };
  });

  afterEach(() => db.$client.close());

  it("creates a book with every field of the registry", async () => {
    const book = await expectBook(
      await post("/api/books", {
        title: "Piranesi",
        author: "Susanna Clarke",
        score: 8.5,
        status: "reading",
        startDate: "2026-01-05",
        link: "https://example.com/piranesi",
        expectation: "A house that is not a house",
        coverUrl: "https://example.com/piranesi.jpg",
      }),
      201,
      {
        title: "Piranesi",
        author: "Susanna Clarke",
        score: 8.5,
        status: "reading",
        startDate: "2026-01-05",
        completedDate: null,
        link: "https://example.com/piranesi",
        expectation: "A house that is not a house",
        coverUrl: "https://example.com/piranesi.jpg",
      },
    );

    expect(book.createdAt).toBeTruthy();
    expect(book.updatedAt).toBeTruthy();
  });

  it("lists the books and reads one back", async () => {
    const created = await expectBook(await post("/api/books", { title: "Dune" }), 201, { title: "Dune" });

    const list = (await (await api.request("/api/books")).json()) as { books: Book[] };
    expect(list.books.map(({ id }) => id)).toEqual([created.id]);

    const read = await expectBook(await api.request(`/api/books/${created.id}`), 200, { id: created.id });
    expect(read.title).toBe("Dune");
  });

  it("updates a book, including clearing its cover", async () => {
    const created = await expectBook(await post("/api/books", { title: "Dune", coverUrl: "https://example.com/dune.jpg" }), 201, {
      coverUrl: "https://example.com/dune.jpg",
    });

    const updated = await expectBook(
      await patch(`/api/books/${created.id}`, { status: "completed", coverUrl: null }),
      200,
      { status: "completed", coverUrl: null },
    );
    expect(updated.title).toBe("Dune");
  });

  it("refuses a malformed book", async () => {
    await expectJson(await post("/api/books", { title: 42 }), 400, { error: "invalid_title" });
    await expectJson(await post("/api/books", { score: "high" }), 400, { error: "invalid_score" });
    await expectJson(await post("/api/books", { status: "burning" }), 400, { error: "invalid_status" });
    await expectJson(await post("/api/books", { coverUrl: 7 }), 400, { error: "invalid_cover_url" });
    await expectJson(await api.request(`/api/books/${missingId}`), 404, { error: "book_not_found" });
  });

  it("creates a book's notebook on demand and reads it back", async () => {
    const book = await expectBook(await post("/api/books", { title: "Dune" }), 201);

    // Before it exists there is nothing to read.
    await expectJson(await api.request(`/api/books/${book.id}/notebook`), 404, { error: "notebook_not_found" });

    const created = await api.request(`/api/books/${book.id}/notebook`, { method: "POST" });
    expect(created.status).toBe(201);
    const notebook = (await created.json()) as { id: string; bookId: string; content: unknown };
    expect(notebook.bookId).toBe(book.id);
    expect(notebook.content).toEqual({ type: "doc", content: [] });

    // Asking again returns the same notebook instead of a second one.
    const again = await api.request(`/api/books/${book.id}/notebook`, { method: "POST" });
    expect(again.status).toBe(201);
    expect(((await again.json()) as { id: string }).id).toBe(notebook.id);
  });

  it("saves the notebook's content", async () => {
    const book = await expectBook(await post("/api/books", { title: "Dune" }), 201);
    await api.request(`/api/books/${book.id}/notebook`, { method: "POST" });

    const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "note" }] }] };
    const saved = await api.request(`/api/books/${book.id}/notebook`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    expect(saved.status).toBe(200);

    const read = await api.request(`/api/books/${book.id}/notebook`);
    expect(((await read.json()) as { content: unknown }).content).toEqual(content);
  });

  it("refuses a notebook for a book that does not exist", async () => {
    await expectJson(
      await api.request(`/api/books/${missingId}/notebook`, { method: "POST" }),
      404,
      { error: "book_not_found" },
    );
  });

  it("deletes a book", async () => {
    const created = await expectBook(await post("/api/books", { title: "Dune" }), 201);

    await expectJson(await api.request(`/api/books/${created.id}`, { method: "DELETE" }), 200, { deleted: created.id });

    const list = (await (await api.request("/api/books")).json()) as { books: Book[] };
    expect(list.books).toEqual([]);
  });

  it("deletes a book's notebook along with the book", async () => {
    const book = await expectBook(await post("/api/books", { title: "Dune" }), 201);
    await api.request(`/api/books/${book.id}/notebook`, { method: "POST" });

    await api.request(`/api/books/${book.id}`, { method: "DELETE" });

    const notebooks = db.$client
      .prepare("SELECT COUNT(*) AS count FROM book_notebooks WHERE book_id = ?")
      .get(book.id) as { count: number };
    expect(notebooks.count).toBe(0);
  });
});
