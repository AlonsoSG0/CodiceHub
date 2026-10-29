import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("GET /api/health", () => {
  it("returns 200 with exactly the health response JSON", async () => {
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"status":"ok"}');
  });
});
