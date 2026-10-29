import { afterEach, describe, expect, it, vi } from "vitest";
import { saveSettings } from "./routine-api";
import type { RoutineSnapshot } from "./routine-api";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const snapshot = {
  settings: {
    weekStartsOn: 1,
    dayStart: "07:00",
    dayEnd: "23:00",
    dayWindows: [
      { weekday: 1, start: "06:30", end: "22:00" },
      { weekday: 3, start: "08:00", end: "21:00" },
    ],
  },
  days: [{ weekday: 1, isTemplate: true }],
  blocks: [],
  occurrences: [],
  mirrors: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("routine API client", () => {
  it("rejects an error response with the server code and message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "block_overlap", message: '"Read" already runs 08:00-08:30.' }, 400)));

    await expect(saveSettings({ dayStart: "06:00" })).rejects.toMatchObject({
      code: "block_overlap",
      message: expect.stringContaining('"Read" already runs 08:00-08:30.'),
    });
  });

  it("decodes a successful settings mutation including each weekday window", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse(snapshot));
    vi.stubGlobal("fetch", request);

    const result: RoutineSnapshot = await saveSettings({ dayWindows: { 1: { start: "06:30", end: "22:00" }, 3: { start: "08:00", end: "21:00" } } });

    expect(request).toHaveBeenCalledWith("/api/routine/settings", expect.objectContaining({ method: "PUT" }));
    expect(result.state.settings.dayWindows).toEqual({
      1: { start: "06:30", end: "22:00" },
      3: { start: "08:00", end: "21:00" },
    });
  });
});
