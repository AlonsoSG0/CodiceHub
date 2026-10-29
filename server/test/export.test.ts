import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import { app } from "../src/app.js";
import type { Page } from "../src/pages/repository.js";

function richDocument() {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Export Notes" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A " },
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
          { type: "text", text: " and " },
          { type: "text", text: "italic", marks: [{ type: "italic" }] },
          { type: "text", text: ", " },
          { type: "text", text: "struck", marks: [{ type: "strike" }] },
          { type: "text", text: ", " },
          { type: "text", text: "inline", marks: [{ type: "code" }] },
          { type: "text", text: ", " },
          { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
          { type: "text", text: "." },
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Lists" }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "First" }] },
              {
                type: "orderedList",
                content: [
                  { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Nested one" }] }] },
                  {
                    type: "listItem",
                    content: [
                      { type: "paragraph", content: [{ type: "text", text: "Nested two" }] },
                      {
                        type: "bulletList",
                        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Nested bullet" }] }] }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }] },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Third" }] }] }],
      },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted text" }] }] },
      {
        type: "codeBlock",
        attrs: { language: "ts" },
        content: [{ type: "text", text: "const answer = 42;" }],
      },
      { type: "horizontalRule" },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Line one" },
          { type: "hardBreak" },
          { type: "text", text: "line two" },
        ],
      },
    ],
  };
}

describe("markdown export API", () => {
  let db: ChubDatabase;
  let request: (input: string, init?: RequestInit) => Promise<Response>;

  beforeEach(() => {
    db = createDb(join(mkdtempSync(join(tmpdir(), "chub-export-")), "chub.db"));
    request = (input, init) => app.request(input, init, { db });
  });

  afterEach(() => db.$client.close());

  async function createPage(title: string, content?: unknown): Promise<Page> {
    const created = await request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    expect(created.status).toBe(201);
    let page = await created.json() as Page;
    if (content !== undefined) {
      const updated = await request(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      expect(updated.status).toBe(200);
      page = await updated.json() as Page;
    }
    return page;
  }

  it("returns markdown with the exact media type and attachment filename", async () => {
    const page = await createPage("Release notes");
    const response = await request(`/api/pages/${page.id}/export.md`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Release notes.md"');
  });

  it("converts rich Tiptap JSON directly into the exact markdown document", async () => {
    const page = await createPage("Rich", richDocument());
    const response = await request(`/api/pages/${page.id}/export.md`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "# Export Notes\n\nA **bold** and *italic*, ~~struck~~, `inline`, [link](https://example.com).\n\n" +
        "## Lists\n\n" +
        "- First\n  1. Nested one\n  2. Nested two\n     - Nested bullet\n- Second\n\n" +
        "3. Third\n\n" +
        "> Quoted text\n\n" +
        "```ts\nconst answer = 42;\n```\n\n" +
        "---\n\n" +
        "Line one  \nline two",
    );
  });

  it("degrades an invented unknown node to its text content", async () => {
    const page = await createPage("Future", {
      type: "doc",
      content: [{ type: "futureWidget", attrs: { version: 99 }, content: [{ type: "text", text: "still readable" }] }],
    });
    const response = await request(`/api/pages/${page.id}/export.md`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("still readable");
  });

  it.each([
    ["an empty document", { type: "doc", content: [] }],
    ["a document without a content array", { type: "doc" }],
  ])("returns an empty valid body for %s", async (_description, content) => {
    const page = await createPage("Empty", content);
    const response = await request(`/api/pages/${page.id}/export.md`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("maps an unknown page to the exact S9 404 response", async () => {
    const response = await request("/api/pages/00000000-0000-4000-8000-000000000000/export.md");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('{"error":"page_not_found"}');
  });

  it("strips path separators, quotes, and control characters from the filename", async () => {
    const page = await createPage('a/b\\c"d\'e\r\n\tf');
    const response = await request(`/api/pages/${page.id}/export.md`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="abcdef.md"');
  });

  it("uses untitled.md for an empty or whitespace-only title", async () => {
    const emptyPage = await createPage("");
    const whitespacePage = await createPage(" \t\n ");

    const emptyResponse = await request(`/api/pages/${emptyPage.id}/export.md`);
    const whitespaceResponse = await request(`/api/pages/${whitespacePage.id}/export.md`);

    expect(emptyResponse.status).toBe(200);
    expect(emptyResponse.headers.get("content-disposition")).toBe('attachment; filename="untitled.md"');
    expect(whitespaceResponse.status).toBe(200);
    expect(whitespaceResponse.headers.get("content-disposition")).toBe('attachment; filename="untitled.md"');
  });

  it("allows exporting a soft-deleted page", async () => {
    const page = await createPage("Deleted note", {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "kept for export" }] }],
    });
    const deleted = await request(`/api/pages/${page.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);

    const response = await request(`/api/pages/${page.id}/export.md`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("kept for export");
  });
});
