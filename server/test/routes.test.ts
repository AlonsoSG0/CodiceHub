import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import type { Page, PageMeta } from "../src/pages/repository.js";
import { app } from "../src/app.js";
const missingId = "00000000-0000-4000-8000-000000000000";

function meta(page: Page): PageMeta {
  return {
    id: page.id,
    parentId: page.parentId,
    title: page.title,
    icon: page.icon,
    position: page.position,
    updatedAt: page.updatedAt,
    deletedAt: page.deletedAt,
    favorite: page.favorite,
    sectionId: page.sectionId,
  };
}

async function expectJson(response: Response, status: number, body: unknown): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await response.text()).toBe(JSON.stringify(body));
}

async function expectPage(response: Response, status: number, expected: Partial<Page>): Promise<Page> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const raw = await response.text();
  const page = JSON.parse(raw) as Page;
  expect(raw).toBe(JSON.stringify(page));
  expect(Object.keys(page)).toEqual(["id", "parentId", "title", "icon", "position", "updatedAt", "deletedAt", "favorite", "sectionId", "content"]);
  expect(page.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(page.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  expect(page).toMatchObject(expected);
  return page;
}

describe("pages HTTP API", () => {
  let db: ChubDatabase;
  let api: { request: (input: string, init?: RequestInit) => Promise<Response> };

  beforeEach(() => {
    db = createDb(join(mkdtempSync(join(tmpdir(), "chub-api-")), "chub.db"));
    api = { request: (input, init) => app.request(input, init, { db }) };
  });

  afterEach(() => db.$client.close());

  const dumpPages = () =>
    db.$client
      .prepare(
        "SELECT id, parent_id, title, content, position, created_at, updated_at, deleted_at FROM pages ORDER BY id"
      )
      .all();

  it("serves the frozen page endpoints with exact response shapes", async () => {
    const rootAResponse = await api.request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Root A" }),
    });
    const rootA = await expectPage(rootAResponse, 201, {
      parentId: null,
      title: "Root A",
      position: 0,
      deletedAt: null,
      content: { type: "doc", content: [] },
    });

    const rootBResponse = await api.request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Root B" }),
    });
    const rootB = await expectPage(rootBResponse, 201, {
      parentId: null,
      title: "Root B",
      position: 1,
      deletedAt: null,
      content: { type: "doc", content: [] },
    });

    const childResponse = await api.request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: rootA.id, title: "Child" }),
    });
    const child = await expectPage(childResponse, 201, {
      parentId: rootA.id,
      title: "Child",
      position: 0,
      deletedAt: null,
      content: { type: "doc", content: [] },
    });

    const grandchildResponse = await api.request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: child.id, title: "Grandchild" }),
    });
    const grandchild = await expectPage(grandchildResponse, 201, {
      parentId: child.id,
      title: "Grandchild",
      position: 0,
      deletedAt: null,
      content: { type: "doc", content: [] },
    });

    const tree = await api.request("/api/pages/tree");
    const treeBody = {
      pages: [rootA, rootB, child, grandchild].map(meta).sort((left, right) => {
        if (left.parentId === null && right.parentId !== null) return -1;
        if (left.parentId !== null && right.parentId === null) return 1;
        return (left.parentId ?? "").localeCompare(right.parentId ?? "") || left.position - right.position || left.id.localeCompare(right.id);
      }),
    };
    await expectJson(tree, 200, treeBody);
    expect((treeBody.pages as Array<PageMeta & { content?: unknown }>).every((page) => !("content" in page))).toBe(true);

    const get = await api.request(`/api/pages/${child.id}`);
    await expectJson(get, 200, child);

    const patchedContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "edited" }] }] };
    const patch = await api.request(`/api/pages/${child.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Renamed child", content: patchedContent }),
    });
    await expectPage(patch, 200, {
      id: child.id,
      parentId: rootA.id,
      title: "Renamed child",
      position: 0,
      deletedAt: null,
      content: patchedContent,
    });

    const move = await api.request(`/api/pages/${child.id}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: rootB.id, position: 0 }),
    });
    expect(move.status).toBe(200);
    expect(move.headers.get("content-type")).toMatch(/^application\/json/);
    const movedRaw = await move.text();
    const movedBody = JSON.parse(movedRaw) as { pages: PageMeta[] };
    expect(movedRaw).toBe(JSON.stringify(movedBody));
    expect(Object.keys(movedBody)).toEqual(["pages"]);
    expect(movedBody.pages).toHaveLength(1);
    expect(Object.keys(movedBody.pages[0]!)).toEqual(["id", "parentId", "title", "icon", "position", "updatedAt", "deletedAt", "favorite", "sectionId"]);
    expect(movedBody.pages[0]).toMatchObject({ id: child.id, parentId: rootB.id, position: 0, title: "Renamed child" });

    const deleteResponse = await api.request(`/api/pages/${rootB.id}`, { method: "DELETE" });
    await expectJson(deleteResponse, 200, { deleted: [rootB.id, child.id, grandchild.id] });

    const trashResponse = await api.request("/api/pages/trash");
    expect(trashResponse.status).toBe(200);
    expect(trashResponse.headers.get("content-type")).toMatch(/^application\/json/);
    const trashRaw = await trashResponse.text();
    const trashBody = JSON.parse(trashRaw) as { pages: Array<PageMeta & { content?: unknown }> };
    expect(trashRaw).toBe(JSON.stringify(trashBody));
    expect(trashBody.pages.map(({ id }) => id).sort()).toEqual([rootB.id, child.id, grandchild.id].sort());
    expect(trashBody.pages.every((page) => !("content" in page))).toBe(true);
    expect(trashBody.pages.every((page) => Object.keys(page).sort().join(",") === "deletedAt,favorite,icon,id,parentId,position,sectionId,title,updatedAt")).toBe(true);

    const restore = await api.request(`/api/pages/${rootB.id}/restore`, { method: "POST" });
    await expectJson(restore, 200, { restored: [rootB.id, child.id, grandchild.id] });

    const purge = await api.request(`/api/pages/${rootB.id}/purge`, { method: "DELETE" });
    await expectJson(purge, 200, { purged: [rootB.id, child.id, grandchild.id] });
    await expectJson(await api.request(`/api/pages/${rootB.id}`), 404, { error: "page_not_found" });
  });

  it("creates a default page with an empty title and Tiptap document", async () => {
    const response = await api.request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await expectPage(response, 201, {
      parentId: null,
      title: "",
      position: 0,
      deletedAt: null,
      content: { type: "doc", content: [] },
    });
  });

  it("favourites a page through PATCH, exposes it in the tree, and rejects a non-boolean", async () => {
    const created = await expectPage(
      await api.request("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Favourite" }),
      }),
      201,
      { title: "Favourite", favorite: false },
    );

    const patched = await api.request(`/api/pages/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ favorite: true }),
    });
    await expectPage(patched, 200, { id: created.id, favorite: true });

    const tree = (await (await api.request("/api/pages/tree")).json()) as { pages: PageMeta[] };
    expect(tree.pages).toHaveLength(1);
    expect(tree.pages[0]?.favorite).toBe(true);

    await expectJson(
      await api.request(`/api/pages/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: "yes" }),
      }),
      400,
      { error: "invalid_favorite" },
    );
  });

  it("serves the backlinks of a page and duplicates it right after itself", async () => {
    const json = { "content-type": "application/json" };
    const target = await expectPage(
      await api.request("/api/pages", { method: "POST", headers: json, body: JSON.stringify({ title: "Target" }) }),
      201,
      { title: "Target" },
    );
    const source = await expectPage(
      await api.request("/api/pages", { method: "POST", headers: json, body: JSON.stringify({ title: "Source" }) }),
      201,
      { title: "Source" },
    );
    await api.request(`/api/pages/${source.id}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "See " }, { type: "pageMention", attrs: { pageId: target.id } }] },
          ],
        },
      }),
    });

    await expectJson(await api.request(`/api/pages/${target.id}/backlinks`), 200, {
      backlinks: [{ id: source.id, title: "Source", icon: null, context: "See" }],
    });

    await expectPage(await api.request(`/api/pages/${target.id}/duplicate`, { method: "POST" }), 201, {
      title: "Target (copy)",
      parentId: null,
    });

    const tree = (await (await api.request("/api/pages/tree")).json()) as { pages: PageMeta[] };
    expect(tree.pages.filter(({ parentId }) => parentId === null).map(({ title }) => title)).toEqual([
      "Target",
      "Target (copy)",
      "Source",
    ]);
  });

  it("creates, renames and deletes sidebar shelves", async () => {
    const json = { "content-type": "application/json" };
    await expectJson(await api.request("/api/sections"), 200, { sections: [] });

    const created = await api.request("/api/sections", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: " Reading " }),
    });
    expect(created.status).toBe(201);
    const section = (await created.json()) as { id: string; name: string; position: number };
    expect(section).toMatchObject({ name: "Reading", position: 0 });
    await expectJson(await api.request("/api/sections"), 200, { sections: [section] });

    await expectJson(
      await api.request(`/api/sections/${section.id}`, {
        method: "PATCH",
        headers: json,
        body: JSON.stringify({ name: "Books" }),
      }),
      200,
      { ...section, name: "Books" },
    );
    await expectJson(
      await api.request(`/api/sections/${section.id}`, { method: "POST", headers: json, body: JSON.stringify({ name: "  " }) }),
      404,
      { error: "not_found" },
    );
    await expectJson(
      await api.request("/api/sections", { method: "POST", headers: json, body: JSON.stringify({ name: "" }) }),
      400,
      { error: "invalid_name" },
    );
    await expectJson(await api.request(`/api/sections/${section.id}`, { method: "DELETE" }), 200, { deleted: section.id });
    await expectJson(await api.request("/api/sections"), 200, { sections: [] });
    await expectJson(
      await api.request(`/api/sections/${section.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ name: "x" }) }),
      404,
      { error: "section_not_found" },
    );
  });

  it("creates a page inside a shelf and moves it back to the default one", async () => {
    const json = { "content-type": "application/json" };
    const section = (await (
      await api.request("/api/sections", { method: "POST", headers: json, body: JSON.stringify({ name: "Reading" }) })
    ).json()) as { id: string };

    const page = await expectPage(
      await api.request("/api/pages", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ title: "In shelf", sectionId: section.id }),
      }),
      201,
      { title: "In shelf", sectionId: section.id },
    );

    const moved = await api.request(`/api/pages/${page.id}/move`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ parentId: null, position: 0, sectionId: null }),
    });
    expect(moved.status).toBe(200);
    expect(((await moved.json()) as { pages: PageMeta[] }).pages[0]).toMatchObject({
      id: page.id,
      sectionId: null,
      parentId: null,
    });
  });

  it("reorders shelves through the move endpoint", async () => {
    const json = { "content-type": "application/json" };
    const create = async (name: string) =>
      (await (
        await api.request("/api/sections", { method: "POST", headers: json, body: JSON.stringify({ name }) })
      ).json()) as { id: string; name: string; position: number };

    const reading = await create("Reading");
    const work = await create("Work");

    await expectJson(
      await api.request(`/api/sections/${work.id}/move`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ position: 0 }),
      }),
      200,
      { sections: [{ ...work, position: 0 }, { ...reading, position: 1 }] },
    );

    await expectJson(
      await api.request(`/api/sections/${work.id}/move`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ position: 0.5 }),
      }),
      400,
      { error: "invalid_position" },
    );
    await expectJson(
      await api.request("/api/sections/missing/move", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ position: 0 }),
      }),
      404,
      { error: "section_not_found" },
    );
  });

  it("maps page_not_found on every id endpoint to the exact 404 body", async () => {
    await expectJson(await api.request(`/api/pages/${missingId}`), 404, { error: "page_not_found" });
    await expectJson(
      await api.request(`/api/pages/${missingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Missing" }),
      }),
      404,
      { error: "page_not_found" }
    );
    await expectJson(
      await api.request(`/api/pages/${missingId}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: null, position: 0 }),
      }),
      404,
      { error: "page_not_found" }
    );
    await expectJson(await api.request(`/api/pages/${missingId}`, { method: "DELETE" }), 404, { error: "page_not_found" });
    await expectJson(await api.request(`/api/pages/${missingId}/restore`, { method: "POST" }), 404, { error: "page_not_found" });
    await expectJson(await api.request(`/api/pages/${missingId}/backlinks`), 404, { error: "page_not_found" });
    await expectJson(await api.request(`/api/pages/${missingId}/duplicate`, { method: "POST" }), 404, { error: "page_not_found" });
    await expectJson(await api.request(`/api/pages/${missingId}/purge`, { method: "DELETE" }), 404, { error: "page_not_found" });
  });

  it("returns invalid_json for malformed JSON on every body-accepting route", async () => {
    const badBody = { method: "POST", headers: { "content-type": "application/json" }, body: "{broken" };
    await expectJson(await api.request("/api/pages", badBody), 400, { error: "invalid_json" });
    await expectJson(await api.request(`/api/pages/${missingId}`, { ...badBody, method: "PATCH" }), 400, { error: "invalid_json" });
    await expectJson(await api.request(`/api/pages/${missingId}/move`, badBody), 400, { error: "invalid_json" });
  });

  it("validates move fields and maps missing parents on create and move", async () => {
    const page = await (await api.request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Page" }),
    })).json() as Page;

    await expectJson(
      await api.request(`/api/pages/${page.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: null }),
      }),
      400,
      { error: "invalid_position" }
    );
    await expectJson(
      await api.request(`/api/pages/${page.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: null, position: 1.5 }),
      }),
      400,
      { error: "invalid_position" }
    );
    await expectJson(
      await api.request(`/api/pages/${page.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: 0 }),
      }),
      400,
      { error: "invalid_parent_id" }
    );
    await expectJson(
      await api.request("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: missingId }),
      }),
      400,
      { error: "parent_not_found" }
    );
    await expectJson(
      await api.request(`/api/pages/${page.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: missingId, position: 0 }),
      }),
      400,
      { error: "parent_not_found" }
    );
  });

  it("rejects descendant cycles with no database changes", async () => {
    const root = await (await api.request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Root" }),
    })).json() as Page;
    const child = await (await api.request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: root.id, title: "Child" }),
    })).json() as Page;
    const before = JSON.stringify(dumpPages());

    await expectJson(
      await api.request(`/api/pages/${root.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: child.id, position: 0 }),
      }),
      400,
      { error: "cannot_move_into_descendant" }
    );
    expect(JSON.stringify(dumpPages())).toBe(before);
  });

  it("does not write on a patch without recognized fields and validates titles", async () => {
    const page = await (await api.request("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Keep" }),
    })).json() as Page;
    const before = JSON.stringify(dumpPages());

    await expectJson(
      await api.request(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ignored: "field" }),
      }),
      200,
      page
    );
    expect(JSON.stringify(dumpPages())).toBe(before);
    await expectJson(
      await api.request("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: 7 }),
      }),
      400,
      { error: "invalid_title" }
    );
    await expectJson(
      await api.request(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: null }),
      }),
      400,
      { error: "invalid_title" }
    );
  });

  it("preserves export and search behavior while mounting uploads", async () => {
    await expectJson(await api.request(`/api/pages/${missingId}/export.md`), 404, { error: "page_not_found" });
    await expectJson(await api.request("/api/search"), 200, { results: [] });
    await expectJson(await api.request("/api/uploads", { method: "POST" }), 400, { error: "unsupported_media_type" });
  });
});
