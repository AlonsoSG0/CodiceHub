import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { ChubDatabase } from "../db/client.js";
import { bookNotebooks, books, type BookNotebookRow, type BookRow } from "../db/schema.js";

export type BookStatus = "reading" | "completed" | "wishlist" | "abandoned";

export type Book = {
  id: string;
  title: string;
  author: string | null;
  score: number | null;
  status: BookStatus;
  startDate: string | null;
  completedDate: string | null;
  link: string | null;
  expectation: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateBookInput = {
  title?: string;
  author?: string | null;
  score?: number | null;
  status?: BookStatus;
  startDate?: string | null;
  completedDate?: string | null;
  link?: string | null;
  expectation?: string | null;
  coverUrl?: string | null;
};

export type UpdateBookInput = Partial<CreateBookInput>;

export type BookNotebook = {
  id: string;
  bookId: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
};

export type BookErrorCode =
  | "book_not_found"
  | "notebook_not_found"
  | "invalid_status"
  | "invalid_score"
  | "invalid_content";

export class BookError extends Error {
  constructor(readonly code: BookErrorCode) {
    super(code);
    this.name = "BookError";
  }
}

export interface BooksRepository {
  list(): Book[];
  get(id: string): Book;
  create(input: CreateBookInput): Book;
  update(id: string, input: UpdateBookInput): Book;
  remove(id: string): void;
  getNotebook(bookId: string): BookNotebook;
  /** The notebook is created on demand: a book that has never been opened has none yet. */
  createNotebook(bookId: string): BookNotebook;
  updateNotebook(bookId: string, content: unknown): BookNotebook;
}

function now(): string {
  return new Date().toISOString();
}

function toBookNotebook(row: BookNotebookRow): BookNotebook {
  let content: unknown;
  try {
    content = JSON.parse(row.content) as unknown;
  } catch (cause) {
    throw new Error("stored book notebook content is invalid JSON", { cause });
  }
  return {
    id: row.id,
    bookId: row.bookId,
    content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    score: row.score,
    status: row.status as BookStatus,
    startDate: row.startDate,
    completedDate: row.completedDate,
    link: row.link,
    expectation: row.expectation,
    coverUrl: row.coverUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const validStatuses: BookStatus[] = ["reading", "completed", "wishlist", "abandoned"];

export function createBooksRepository(db: ChubDatabase): BooksRepository {
  return {
    list(): Book[] {
      return db.select().from(books).orderBy(asc(books.title), asc(books.id)).all().map(toBook);
    },
    get(id: string): Book {
      const row = db.select().from(books).where(eq(books.id, id)).get();
      if (!row) throw new BookError("book_not_found");
      return toBook(row);
    },
    create(input): Book {
      const status = input.status ?? "reading";
      if (!validStatuses.includes(status)) throw new BookError("invalid_status");
      if (input.score !== undefined && input.score !== null && (typeof input.score !== "number" || input.score < 0 || input.score > 10)) {
        throw new BookError("invalid_score");
      }

      const id = randomUUID();
      const timestamp = now();
      db.$client
        .prepare(
          "INSERT INTO books (id, title, author, score, status, start_date, completed_date, link, expectation, cover_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          id,
          input.title ?? "",
          input.author ?? null,
          input.score ?? null,
          status,
          input.startDate ?? null,
          input.completedDate ?? null,
          input.link ?? null,
          input.expectation ?? null,
          input.coverUrl ?? null,
          timestamp,
          timestamp
        );
      return this.get(id);
    },
    update(id, input): Book {
      const row = db.select().from(books).where(eq(books.id, id)).get();
      if (!row) throw new BookError("book_not_found");
      const status = input.status ?? row.status;
      if (!validStatuses.includes(status as BookStatus)) throw new BookError("invalid_status");
      if (input.score !== undefined && input.score !== null && (typeof input.score !== "number" || input.score < 0 || input.score > 10)) {
        throw new BookError("invalid_score");
      }
      const timestamp = now();
      db.$client
        .prepare(
          "UPDATE books SET title = ?, author = ?, score = ?, status = ?, start_date = ?, completed_date = ?, link = ?, expectation = ?, cover_url = ?, updated_at = ? WHERE id = ?"
        )
        .run(
          input.title ?? row.title,
          input.author === undefined ? row.author : input.author,
          input.score === undefined ? row.score : input.score,
          status,
          input.startDate === undefined ? row.startDate : input.startDate,
          input.completedDate === undefined ? row.completedDate : input.completedDate,
          input.link === undefined ? row.link : input.link,
          input.expectation === undefined ? row.expectation : input.expectation,
          input.coverUrl === undefined ? row.coverUrl : input.coverUrl,
          timestamp,
          id
        );
      return this.get(id);
    },
    remove(id): void {
      const row = db.select().from(books).where(eq(books.id, id)).get();
      if (!row) throw new BookError("book_not_found");
      db.$client.prepare("DELETE FROM books WHERE id = ?").run(id);
    },

    getNotebook(bookId): BookNotebook {
      const row = db.select().from(bookNotebooks).where(eq(bookNotebooks.bookId, bookId)).get();
      if (!row) throw new BookError("notebook_not_found");
      return toBookNotebook(row);
    },

    createNotebook(bookId): BookNotebook {
      const create = db.$client.transaction(() => {
        if (!db.select().from(books).where(eq(books.id, bookId)).get()) throw new BookError("book_not_found");

        const existing = db.select().from(bookNotebooks).where(eq(bookNotebooks.bookId, bookId)).get();
        if (existing) return toBookNotebook(existing);

        const id = randomUUID();
        const timestamp = now();
        db.$client
          .prepare("INSERT INTO book_notebooks (id, book_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
          .run(id, bookId, '{"type":"doc","content":[]}', timestamp, timestamp);
        return toBookNotebook(db.select().from(bookNotebooks).where(eq(bookNotebooks.bookId, bookId)).get()!);
      });
      return create.immediate();
    },

    updateNotebook(bookId, content): BookNotebook {
      const update = db.$client.transaction(() => {
        const row = db.select().from(bookNotebooks).where(eq(bookNotebooks.bookId, bookId)).get();
        if (!row) throw new BookError("notebook_not_found");

        const serialized = JSON.stringify(content);
        if (serialized === undefined) throw new BookError("invalid_content");
        db.$client
          .prepare("UPDATE book_notebooks SET content = ?, updated_at = ? WHERE id = ?")
          .run(serialized, now(), row.id);
        return toBookNotebook(db.select().from(bookNotebooks).where(eq(bookNotebooks.bookId, bookId)).get()!);
      });
      return update.immediate();
    },
  };
}
