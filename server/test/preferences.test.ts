import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import { app } from "../src/app.js";

describe("preferences HTTP API", () => {
  let db: ChubDatabase;
  let api: { request: (input: string, init?: RequestInit) => Promise<Response> };

  beforeEach(() => {
    db = createDb(join(mkdtempSync(join(tmpdir(), "chub-preferences-")), "chub.db"));
    api = { request: (input, init) => app.request(input, init, { db }) };
  });

  afterEach(() => db.$client.close());

  const readPreferences = async (): Promise<Record<string, unknown>> => {
    const response = await api.request("/api/preferences");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { preferences: Record<string, unknown> };
    return body.preferences;
  };

  const putPreference = (key: string, value: unknown): Promise<Response> =>
    api.request(`/api/preferences/${key}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value }),
    });

  it("returns an empty preferences object when there are no values", async () => {
    expect(await readPreferences()).toEqual({});
  });

  it("upserts one value and returns it from a subsequent read", async () => {
    const response = await putPreference("appearance.theme", "dark");
    expect(response.status).toBe(200);
    const row = await response.json();
    expect(row).toMatchObject({ key: "appearance.theme", value: '"dark"' });
    expect(typeof row.updatedAt).toBe("string");
    expect(await readPreferences()).toEqual({ "appearance.theme": "dark" });
  });

  it("overwrites an existing preference", async () => {
    await putPreference("appearance.theme", "light");
    const response = await putPreference("appearance.theme", "dark");
    expect(response.status).toBe(200);
    expect(await readPreferences()).toEqual({ "appearance.theme": "dark" });
  });

  it("keeps values for different keys independent", async () => {
    await putPreference("appearance.theme", "dark");
    await putPreference("notes.recent", true);
    expect(await readPreferences()).toEqual({ "appearance.theme": "dark", "notes.recent": true });
  });

  it("returns invalid_value when the submitted value is not JSON-serialisable", async () => {
    const response = await api.request("/api/preferences/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_value" });
    expect(await readPreferences()).toEqual({});
  });

  it("returns invalid_value when an existing stored value is invalid JSON", async () => {
    db.$client.prepare("INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)").run(
      "broken.preference",
      "not-json",
      new Date().toISOString(),
    );
    const response = await api.request("/api/preferences");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_value" });
  });

  it("round-trips a stored JSON object", async () => {
    const value = { days: 30, scope: "habits", nested: { enabled: true } };
    const response = await putPreference("modules.retention", value);
    expect(response.status).toBe(200);
    expect(await readPreferences()).toEqual({ "modules.retention": value });
  });
});
