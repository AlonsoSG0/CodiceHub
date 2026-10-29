import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createDb, type ChubDatabase } from "../src/db/client.js";

const fixtureDirectory = fileURLToPath(new URL("./fixtures/web/", import.meta.url));
const fixtureIndex = readFileSync(join(fixtureDirectory, "index.html"), "utf8");
const previousWebDirectory = process.env.CHUB_WEB_DIR;

let database: ChubDatabase;

beforeEach(() => {
  process.env.CHUB_WEB_DIR = fixtureDirectory;
  const dbPath = join(mkdtempSync(join(tmpdir(), "chub-static-test-")), "chub.db");
  database = createDb(dbPath);
});

afterEach(() => {
  database.$client.close();
  if (previousWebDirectory === undefined) delete process.env.CHUB_WEB_DIR;
  else process.env.CHUB_WEB_DIR = previousWebDirectory;
});

function request(path: string): Promise<Response> {
  return app.request(path, {}, { db: database });
}

describe("static web app serving", () => {
  it("serves the fixture index at / as HTML", async () => {
    const response = await request("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html(?:;|$)/);
    expect(await response.text()).toBe(fixtureIndex);
  });

  it.each(["/p/abc", "/trash"])("falls back to index.html for deep route %s", async (path) => {
    const response = await request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html(?:;|$)/);
    expect(await response.text()).toBe(fixtureIndex);
  });

  it("serves a real fixture asset with its content type", async () => {
    const response = await request("/styles.css");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/css(?:;|$)/);
    expect(await response.text()).toBe("body { color: rebeccapurple; }\n");
  });

  it("keeps unknown API paths as JSON 404s instead of SPA HTML", async () => {
    const response = await request("/api/nope");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    const body = await response.text();
    expect(body).toBe('{"error":"not_found"}');
    expect(body).not.toContain("fixture app");
  });

  it("keeps unknown upload paths as 404s instead of SPA HTML", async () => {
    const response = await request("/uploads/nope.png");

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("fixture app");
  });

  it("preserves the existing page tree endpoint response", async () => {
    const response = await request("/api/pages/tree");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.text()).toBe('{"pages":[]}');
  });

  it.each(["missing configured directory", "unconfigured default directory"])(
    "returns an empty 404 when the web directory is %s",
    async (directoryState) => {
      if (directoryState === "missing configured directory") {
        process.env.CHUB_WEB_DIR = join(dirname(fixtureDirectory), "definitely-absent-web-directory");
      } else {
        delete process.env.CHUB_WEB_DIR;
      }

      const response = await request("/");

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    },
  );

  it("keeps the API available when the configured web directory is absent", async () => {
    process.env.CHUB_WEB_DIR = join(dirname(fixtureDirectory), "definitely-absent-web-directory");

    const response = await request("/api/pages/tree");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.text()).toBe('{"pages":[]}');
  });
});
