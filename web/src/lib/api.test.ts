import { afterEach, describe, expect, it, vi } from "vitest";
import { createPage, fetchPage, fetchTree } from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("pages API client", () => {
  it("loads the flat tree response", async () => {
    const pages = [{ id: "root", parentId: null, title: "Root", position: 0, updatedAt: "now", deletedAt: null }];
    const request = vi.fn().mockResolvedValue(jsonResponse({ pages }));
    vi.stubGlobal("fetch", request);

    await expect(fetchTree()).resolves.toEqual(pages);
    expect(request.mock.calls[0]?.[0]).toBe("/api/pages/tree");
  });

  it("loads one page by id", async () => {
    const page = { id: "root", parentId: null, title: "Root", position: 0, updatedAt: "now", deletedAt: null, content: {} };
    const request = vi.fn().mockResolvedValue(jsonResponse(page));
    vi.stubGlobal("fetch", request);

    await expect(fetchPage("root")).resolves.toEqual(page);
    expect(request.mock.calls[0]?.[0]).toBe("/api/pages/root");
  });

  it("posts the create request body", async () => {
    const page = { id: "child", parentId: "root", title: "", position: 0, updatedAt: "now", deletedAt: null, content: {} };
    const request = vi.fn().mockResolvedValue(jsonResponse(page, 201));
    vi.stubGlobal("fetch", request);

    await expect(createPage({ parentId: "root", title: "", position: 0 })).resolves.toEqual(page);
    expect(request).toHaveBeenCalledWith("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: "root", title: "", position: 0 }),
    });
  });

  it("throws an Error carrying the server error code on non-2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "parent_not_found" }, 400)));

    const error = await createPage({ parentId: "missing" }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: "parent_not_found",
      code: "parent_not_found",
      status: 400,
    });
  });
});
