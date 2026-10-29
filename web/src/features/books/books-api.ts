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
  /** A cover image: an absolute URL, or the `/uploads/…` path of an uploaded file. */
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const code =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `http_${response.status}`;
    throw new Error(code);
  }
  return body as T;
}

function jsonInit(method: "POST" | "PATCH", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function fetchBooks(): Promise<Book[]> {
  const response = await requestJson<{ books: Book[] }>("/api/books");
  return response.books;
}

export function fetchBook(id: string): Promise<Book> {
  return requestJson<Book>(`/api/books/${encodeURIComponent(id)}`);
}

export function createBook(input: CreateBookInput): Promise<Book> {
  return requestJson<Book>("/api/books", jsonInit("POST", input));
}

export function updateBook(id: string, patch: UpdateBookInput): Promise<Book> {
  return requestJson<Book>(`/api/books/${encodeURIComponent(id)}`, jsonInit("PATCH", patch));
}

export function deleteBook(id: string): Promise<void> {
  return requestJson<void>(`/api/books/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** One notebook per book: a single page, with no tree of its own. */
export type BookNotebook = {
  id: string;
  bookId: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
};

export function fetchBookNotebook(bookId: string): Promise<BookNotebook> {
  return requestJson<BookNotebook>(`/api/books/${encodeURIComponent(bookId)}/notebook`);
}

/** Creates the notebook if the book has none yet; the existing one is returned unchanged. */
export function createBookNotebook(bookId: string): Promise<BookNotebook> {
  return requestJson<BookNotebook>(`/api/books/${encodeURIComponent(bookId)}/notebook`, { method: "POST" });
}

export function saveBookNotebook(bookId: string, content: unknown): Promise<BookNotebook> {
  return requestJson<BookNotebook>(`/api/books/${encodeURIComponent(bookId)}/notebook`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}
