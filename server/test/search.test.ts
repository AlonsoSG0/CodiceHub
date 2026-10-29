import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import { app } from "../src/app.js";

type SearchPage = { id: string; title: string; content: unknown };
type SearchResult = { id: string; title: string; snippet: string };
const emptyContent = { type: "doc", content: [] };

function paragraph(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

describe("GET /api/search?q=", () => {
  let db: ChubDatabase;
  let request: (url: string, init?: RequestInit) => Promise<Response>;

  beforeEach(() => {
    db = createDb(join(mkdtempSync(join(tmpdir(), "chub-search-")), "chub.db"));
    request = (url, init) => app.request(url, init, { db });
  });

  afterEach(() => db.$client.close());

  async function createPage(title: string, content: unknown = emptyContent): Promise<SearchPage> {
    const response = await request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    expect(response.status).toBe(201);
    const page = await response.json() as SearchPage;
    if (content !== emptyContent) {
      const patch = await request(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      expect(patch.status).toBe(200);
      return await patch.json() as SearchPage;
    }
    return page;
  }

  async function expectResults(url: string, results: SearchResult[]): Promise<void> {
    const response = await request(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    const raw = await response.text();
    expect(raw).toBe(JSON.stringify({ results }));
  }

  it("matches title and body text, returns a plain body excerpt, and uses the title when body text is absent", async () => {
    const titleMatch = await createPage("Compass index");
    const bodyMatch = await createPage("Travel log", paragraph("The paper compass points to a hidden room."));

    const response = await request("/api/search?q=compass");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    const raw = await response.text();
    const body = JSON.parse(raw) as { results: SearchResult[] };
    expect(raw).toBe(JSON.stringify(body));
    expect(body.results).toHaveLength(2);
    expect(body.results.find(({ id }) => id === titleMatch.id)).toEqual({
      id: titleMatch.id,
      title: "Compass index",
      snippet: "Compass index",
    });
    expect(body.results.find(({ id }) => id === bodyMatch.id)).toEqual({
      id: bodyMatch.id,
      title: "Travel log",
      snippet: "The paper compass points to a hidden room.",
    });
    expect(body.results.every(({ snippet }) => snippet.length > 0)).toBe(true);
  });

  it("excludes soft-deleted matching pages", async () => {
    const active = await createPage("Beacon in use");
    const deleted = await createPage("Beacon in trash");
    const deleteResponse = await request(`/api/pages/${deleted.id}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.text()).toBe(JSON.stringify({ deleted: [deleted.id] }));

    await expectResults(`/api/search?q=beacon`, [{ id: active.id, title: active.title, snippet: active.title }]);
  });

  it("returns an empty result array for missing and blank queries", async () => {
    await expectResults("/api/search", []);
    await expectResults("/api/search?q=%20%20%20", []);
  });

  it("caps relevance-ranked results at 20", async () => {
    for (let index = 0; index < 24; index += 1) {
      await createPage(`Signal ${index}`);
    }

    const response = await request("/api/search?q=signal");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    const raw = await response.text();
    const body = JSON.parse(raw) as { results: SearchResult[] };
    expect(raw).toBe(JSON.stringify(body));
    expect(body.results).toHaveLength(20);
  });

  it.each(["\"", "*", "NEAR(", "a AND", "((("])("never returns a 5xx or non-JSON body for hostile input %j", async (query) => {
    const url = `/api/search?q=${encodeURIComponent(query)}`;
    const response = await request(url);
    expect(response.status).toBe(200);
    expect(response.status).toBeLessThan(500);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.text()).toBe('{"results":[]}');
  });

  it("does not change a page when searching", async () => {
    const page = await createPage("Bookmark", paragraph("Keep this note unchanged."));
    const beforeResponse = await request(`/api/pages/${page.id}`);
    const before = await beforeResponse.text();
    const search = await request("/api/search?q=unchanged");
    expect(search.status).toBe(200);
    const afterResponse = await request(`/api/pages/${page.id}`);
    const after = await afterResponse.text();
    expect(after).toBe(before);
  });
});
