import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import type { Page } from "../src/pages/repository.js";

describe("page icons HTTP API", () => {
  let db: ChubDatabase;
  let api: { request: (input: string, init?: RequestInit) => Promise<Response> };

  beforeEach(() => {
    db = createDb(join(mkdtempSync(join(tmpdir(), "chub-page-icons-")), "chub.db"));
    api = { request: (input, init) => app.request(input, init, { db }) };
  });

  afterEach(() => db.$client.close());

  const send = (path: string, method: "POST" | "PATCH", body: unknown) =>
    api.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const createPage = async (body: unknown = {}): Promise<Page> => {
    const response = await send("/api/pages", "POST", body);
    expect(response.status).toBe(201);
    return (await response.json()) as Page;
  };

  it("stores library names and emoji icons on created pages", async () => {
    const lucide = await createPage({ icon: "notebook-text" });
    const emoji = await createPage({ icon: "emoji:📓" });

    expect(lucide.icon).toBe("notebook-text");
    expect(emoji.icon).toBe("emoji:📓");
  });

  it("patches an icon into the response and page tree, and null clears it", async () => {
    const page = await createPage();
    const patched = await send(`/api/pages/${page.id}`, "PATCH", { icon: "emoji:📓" });
    expect(patched.status).toBe(200);
    expect((await patched.json() as Page).icon).toBe("emoji:📓");

    const tree = await api.request("/api/pages/tree");
    expect((await tree.json() as { pages: Array<{ id: string; icon: string | null }> }).pages).toContainEqual({
      id: page.id,
      parentId: null,
      title: "",
      position: 0,
      updatedAt: expect.any(String),
      deletedAt: null,
      favorite: false,
      sectionId: null,
      icon: "emoji:📓",
    });

    const cleared = await send(`/api/pages/${page.id}`, "PATCH", { icon: null });
    expect(cleared.status).toBe(200);
    expect((await cleared.json() as Page).icon).toBeNull();
  });

  it("accepts a padded valid icon and stores the normalized value", async () => {
    const page = await createPage({ icon: " notebook-text " });
    expect(page.icon).toBe("notebook-text");
  });

  it("accepts a zero-width-joiner emoji sequence", async () => {
    const page = await createPage({ icon: "emoji:👨‍👩" });
    expect(page.icon).toBe("emoji:👨‍👩");
  });

  it.each([
    ["emoji with a bidi override", "emoji:\u202e"],
    ["non-string", 42],
    ["emoji without prefix", "📓"],
    ["name with spaces", "notebook text"],
    ["uppercase name", "Notebook-text"],
    ["41-character name", "a".repeat(41)],
    ["empty emoji", "emoji:"],
    ["emoji whitespace", "emoji:two words"],
    ["emoji control character", "emoji:\u0000"],
  ])("rejects %s on create and patch without changing stored data", async (_case, invalidIcon) => {
    const page = await createPage({ icon: "notebook-text" });
    const before = db.$client.prepare("SELECT * FROM pages WHERE id = ?").get(page.id);

    const createResponse = await send("/api/pages", "POST", { icon: invalidIcon });
    expect(createResponse.status).toBe(400);
    expect(await createResponse.text()).toBe('{"error":"invalid_icon"}');
    expect(db.$client.prepare("SELECT * FROM pages WHERE id = ?").get(page.id)).toEqual(before);
    expect(db.$client.prepare("SELECT COUNT(*) AS count FROM pages").get()).toEqual({ count: 1 });

    const patchResponse = await send(`/api/pages/${page.id}`, "PATCH", { icon: invalidIcon });
    expect(patchResponse.status).toBe(400);
    expect(await patchResponse.text()).toBe('{"error":"invalid_icon"}');
    expect(db.$client.prepare("SELECT * FROM pages WHERE id = ?").get(page.id)).toEqual(before);
  });
});
