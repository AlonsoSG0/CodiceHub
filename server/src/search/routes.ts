import { Hono } from "hono";
import type { ChubDatabase } from "../db/client.js";

type AppEnv = { Bindings: { db: ChubDatabase } };
type SearchRow = { id: string; title: string; content: string };
type SearchResult = { id: string; title: string; snippet: string };

const MAX_QUERY_LENGTH = 2048;
const MAX_TERMS = 32;
const MAX_TERM_LENGTH = 64;
const MAX_SNIPPET_LENGTH = 160;

function tokenize(query: string): string[] {
  return Array.from(query.slice(0, MAX_QUERY_LENGTH).matchAll(/[\p{L}\p{N}_]+/gu), ([term]) => term.slice(0, MAX_TERM_LENGTH))
    .slice(0, MAX_TERMS);
}

function safeFtsQuery(terms: string[]): string {
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" ");
}

function extractBodyText(serialized: string): string {
  try {
    const document: unknown = JSON.parse(serialized);
    const chunks: string[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
        return;
      }
      if (typeof value !== "object" || value === null) return;

      const node = value as Record<string, unknown>;
      if (typeof node.text === "string") chunks.push(node.text);
      if (Array.isArray(node.content)) visit(node.content);
    };
    visit(document);
    return chunks.join(" ").replace(/\s+/gu, " ").trim();
  } catch {
    return "";
  }
}

function makeSnippet(content: string, title: string, terms: string[]): string {
  const body = extractBodyText(content);
  const lowerBody = body.toLocaleLowerCase();
  const offsets = terms
    .map((term) => lowerBody.indexOf(term.toLocaleLowerCase()))
    .filter((offset) => offset >= 0);
  if (offsets.length === 0) return title.trim() || "Untitled page";

  const matchOffset = Math.min(...offsets);
  const start = Math.max(0, matchOffset - Math.floor(MAX_SNIPPET_LENGTH / 2));
  const end = Math.min(body.length, start + MAX_SNIPPET_LENGTH);
  const excerpt = body.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${end < body.length ? "…" : ""}`;
}

function searchPages(db: ChubDatabase, query: string): SearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const ftsQuery = safeFtsQuery(terms);
  const rows = db.$client
    .prepare(
      `SELECT pages.id, pages.title, pages.content
       FROM pages_fts
       JOIN pages ON pages.rowid = pages_fts.rowid
       WHERE pages.deleted_at IS NULL AND pages_fts MATCH ?
       ORDER BY bm25(pages_fts), pages.id
       LIMIT 20`,
    )
    .all(ftsQuery) as SearchRow[];

  return rows.map(({ id, title, content }) => ({
    id,
    title,
    snippet: makeSnippet(content, title, terms),
  }));
}

export function createSearchRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/search", (c) => {
    const query = c.req.query("q");
    if (query === undefined || query.trim().length === 0) return c.json({ results: [] }, 200);

    return c.json({ results: searchPages(c.env.db, query) }, 200);
  });

  return routes;
}
