import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import { app } from "../src/app.js";

type ChecklistItem = {
  id: string;
  listId: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  priority: string;
  recurrence: string;
  goalId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};
type Checklist = {
  id: string;
  name: string;
  position: number;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
};

const missingId = "00000000-0000-4000-8000-000000000000";

async function expectJson(response: Response, status: number, body: unknown): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await response.text()).toBe(JSON.stringify(body));
}

function expectKeys(value: object, keys: string[]): void {
  expect(Object.keys(value)).toEqual(keys);
}

async function expectChecklist(response: Response, status: number, expected: Partial<Checklist> = {}): Promise<Checklist> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const checklist = (await response.json()) as Checklist;
  expectKeys(checklist, ["id", "name", "position", "items", "createdAt", "updatedAt"]);
  expect(checklist.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(checklist).toMatchObject(expected);
  return checklist;
}

async function expectItem(response: Response, status: number, expected: Partial<ChecklistItem> = {}): Promise<ChecklistItem> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const item = (await response.json()) as ChecklistItem;
  expectKeys(item, ["id", "listId", "text", "done", "dueDate", "priority", "recurrence", "goalId", "position", "createdAt", "updatedAt"]);
  expect(item.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(item).toMatchObject(expected);
  return item;
}

describe("checklists HTTP API", () => {
  let db: ChubDatabase;
  let directory: string;
  let api: { request: (input: string, init?: RequestInit) => Promise<Response> };

  const post = (path: string, body: unknown): Promise<Response> =>
    api.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const patch = (path: string, body: unknown): Promise<Response> =>
    api.request(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "chub-checklists-api-"));
    db = createDb(join(directory, "chub.db"));
    api = { request: (input, init) => app.request(input, init, { db }) };
  });

  afterEach(() => {
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates, orders, updates, and deletes checklists and their items", async () => {
    const first = await expectChecklist(await post("/api/checklists", { name: "Morning" }), 201, {
      name: "Morning",
      position: 0,
      items: [],
    });
    const second = await expectChecklist(await post("/api/checklists", { name: "Evening" }), 201, {
      name: "Evening",
      position: 1,
      items: [],
    });
    expect(first.createdAt).toBeTruthy();
    expect(first.updatedAt).toBeTruthy();

    const firstItem = await expectItem(await post(`/api/checklists/${first.id}/items`, { text: "Read" }), 201, {
      listId: first.id,
      text: "Read",
      done: false,
      dueDate: null,
      priority: "none",
      recurrence: "none",
      goalId: null,
      position: 0,
    });
    const secondItem = await expectItem(await post(`/api/checklists/${first.id}/items`, { text: "Stretch" }), 201, {
      listId: first.id,
      text: "Stretch",
      done: false,
      position: 1,
    });
    const eveningItem = await expectItem(await post(`/api/checklists/${second.id}/items`, { text: "Plan tomorrow" }), 201, {
      listId: second.id,
      text: "Plan tomorrow",
      done: false,
      position: 0,
    });

    const renamed = await expectChecklist(await patch(`/api/checklists/${first.id}`, { name: "Daily" }), 200, {
      id: first.id,
      name: "Daily",
    });
    expect(renamed.items.map(({ id }) => id)).toEqual([firstItem.id, secondItem.id]);
    await expectItem(await patch(`/api/checklists/items/${firstItem.id}`, { done: true }), 200, {
      id: firstItem.id,
      text: "Read",
      done: true,
      position: 0,
    });
    await expectItem(await patch(`/api/checklists/items/${secondItem.id}`, { text: "Move" }), 200, {
      id: secondItem.id,
      text: "Move",
      done: false,
      position: 1,
    });

    const listed = (await (await api.request("/api/checklists")).json()) as { checklists: Checklist[] };
    expectKeys(listed, ["checklists"]);
    expect(listed.checklists.map(({ id, name, position }) => [id, name, position])).toEqual([
      [first.id, "Daily", 0],
      [second.id, "Evening", 1],
    ]);
    expect(listed.checklists[0].items.map(({ id, text, done, position }) => [id, text, done, position])).toEqual([
      [firstItem.id, "Read", true, 0],
      [secondItem.id, "Move", false, 1],
    ]);
    expect(listed.checklists[1].items.map(({ id }) => id)).toEqual([eveningItem.id]);

    await expectJson(await api.request(`/api/checklists/items/${secondItem.id}`, { method: "DELETE" }), 200, {
      deleted: secondItem.id,
    });
    await expectJson(await api.request(`/api/checklists/${first.id}`, { method: "DELETE" }), 200, {
      deleted: first.id,
    });
    await expectJson(await patch(`/api/checklists/items/${firstItem.id}`, { done: false }), 404, {
      error: "item_not_found",
    });
    const afterCascade = (await (await api.request("/api/checklists")).json()) as { checklists: Checklist[] };
    expect(afterCascade.checklists.map(({ id }) => id)).toEqual([second.id]);
    expect(afterCascade.checklists[0].items).toEqual([eveningItem]);
    await expectJson(await api.request(`/api/checklists/${second.id}`, { method: "DELETE" }), 200, {
      deleted: second.id,
    });
    expect((await (await api.request("/api/checklists")).json()).checklists).toEqual([]);
  });

  it("returns every contract error and leaves rows and append positions unchanged", async () => {
    const checklist = await expectChecklist(await post("/api/checklists", { name: "Keep" }), 201, { position: 0 });
    const item = await expectItem(await post(`/api/checklists/${checklist.id}/items`, { text: "Kept" }), 201, {
      position: 0,
    });
    const before = (await (await api.request("/api/checklists")).json()) as { checklists: Checklist[] };

    await expectJson(
      await api.request("/api/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      400,
      { error: "invalid_json" }
    );
    await expectJson(await post("/api/checklists", []), 400, { error: "invalid_body" });
    await expectJson(await post("/api/checklists", {}), 400, { error: "invalid_name" });
    await expectJson(await post("/api/checklists", { name: 3 }), 400, { error: "invalid_name" });
    await expectJson(await post("/api/checklists", { name: "   " }), 400, { error: "invalid_name" });
    await expectJson(await post(`/api/checklists/${checklist.id}/items`, {}), 400, { error: "invalid_text" });
    await expectJson(await post(`/api/checklists/${checklist.id}/items`, { text: "   " }), 400, { error: "invalid_text" });
    await expectJson(await patch(`/api/checklists/items/${item.id}`, { text: 3 }), 400, { error: "invalid_text" });
    await expectJson(await patch(`/api/checklists/items/${item.id}`, { done: "yes" }), 400, { error: "invalid_done" });
    await expectJson(await patch(`/api/checklists/${missingId}`, { name: "Missing" }), 404, {
      error: "checklist_not_found",
    });
    await expectJson(await api.request(`/api/checklists/${missingId}`, { method: "DELETE" }), 404, {
      error: "checklist_not_found",
    });
    await expectJson(await post(`/api/checklists/${missingId}/items`, { text: "Missing" }), 404, {
      error: "checklist_not_found",
    });
    await expectJson(await patch(`/api/checklists/items/${missingId}`, { done: true }), 404, { error: "item_not_found" });
    await expectJson(await api.request(`/api/checklists/items/${missingId}`, { method: "DELETE" }), 404, {
      error: "item_not_found",
    });

    expect((await (await api.request("/api/checklists")).json()).checklists).toEqual(before.checklists);
    const appendedChecklist = await expectChecklist(await post("/api/checklists", { name: "Next" }), 201, {
      position: 1,
    });
    const appendedItem = await expectItem(await post(`/api/checklists/${checklist.id}/items`, { text: "Next" }), 201, {
      position: 1,
    });
    expect(appendedChecklist.id).not.toBe(checklist.id);
    expect(appendedItem.id).not.toBe(item.id);
  });

  it("spawns the next occurrence when a repeating check is completed", async () => {
    const list = await expectChecklist(await post("/api/checklists", { name: "Routine" }), 201);
    const daily = await expectItem(
      await post(`/api/checklists/${list.id}/items`, { text: "Stretch" }),
      201,
    );

    await expectJson(
      await patch(`/api/checklists/items/${daily.id}`, { recurrence: "daily" }),
      400,
      { error: "invalid_recurrence" },
    );

    await expectItem(
      await patch(`/api/checklists/items/${daily.id}`, { recurrence: "daily", dueDate: "2026-11-01" }),
      200,
      { recurrence: "daily", dueDate: "2026-11-01" },
    );

    const completed = await expectItem(
      await patch(`/api/checklists/items/${daily.id}`, { done: true }),
      200,
      { done: true, recurrence: "none" },
    );
    expect(completed.id).toBe(daily.id);

    const after = (await (await api.request("/api/checklists")).json()) as { checklists: Checklist[] };
    const items = after.checklists[0]!.items;
    expect(items).toHaveLength(2);
    const next = items.find((item) => item.id !== daily.id)!;
    expect(next).toMatchObject({ text: "Stretch", done: false, dueDate: "2026-11-02", recurrence: "daily", position: 1 });
  });

  it("closes everything open or clears the finished ones in one call", async () => {
    const list = await expectChecklist(await post("/api/checklists", { name: "Batch" }), 201);
    const one = await expectItem(await post(`/api/checklists/${list.id}/items`, { text: "One" }), 201);
    const two = await expectItem(await post(`/api/checklists/${list.id}/items`, { text: "Two" }), 201);
    const three = await expectItem(await post(`/api/checklists/${list.id}/items`, { text: "Three" }), 201);
    await expectItem(await patch(`/api/checklists/items/${one.id}`, { done: true }), 200, { done: true });

    const completed = await expectChecklist(await post(`/api/checklists/${list.id}/bulk`, { action: "complete-open" }), 200);
    expect(completed.items.every((item) => item.done)).toBe(true);
    expect(completed.items.map(({ text }) => text)).toEqual(["One", "Two", "Three"]);

    const cleared = await expectChecklist(await post(`/api/checklists/${list.id}/bulk`, { action: "delete-completed" }), 200);
    expect(cleared.items).toEqual([]);
    expect(two.id).not.toBe(three.id);

    await expectJson(await post(`/api/checklists/${list.id}/bulk`, { action: "nope" }), 400, { error: "invalid_action" });
    await expectJson(await post("/api/checklists/nope/bulk", { action: "complete-open" }), 404, {
      error: "checklist_not_found",
    });
  });

  it("prunes old checks by scope and removes only the groups left empty", async () => {
    const list = await expectChecklist(await post("/api/checklists", { name: "Retention" }), 201);
    const keepRecent = await expectItem(await post(`/api/checklists/${list.id}/items`, { text: "Today" }), 201);
    const oldDone = await expectItem(await post(`/api/checklists/${list.id}/items`, { text: "Old done" }), 201);
    const oldOpen = await expectItem(await post(`/api/checklists/${list.id}/items`, { text: "Old open" }), 201);
    await expectItem(await patch(`/api/checklists/items/${oldDone.id}`, { done: true }), 200, {
      id: oldDone.id,
      done: true,
    });

    const backdate = (id: string, days: number) =>
      db.$client
        .prepare("UPDATE checklist_items SET created_at = ? WHERE id = ?")
        .run(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(), id);
    backdate(oldDone.id, 30);
    backdate(oldOpen.id, 30);

    await expectJson(
      await post("/api/checklists/prune", { olderThanDays: 7, scope: "completed" }),
      200,
      { deletedItems: 1, deletedGroups: 0 },
    );

    const afterCompleted = (await (await api.request("/api/checklists")).json()) as { checklists: Checklist[] };
    const remaining = afterCompleted.checklists[0]!.items.map(({ id }) => id);
    expect(remaining).toEqual([keepRecent.id, oldOpen.id]);

    // The recent check survives, so the group is not empty yet.
    await expectJson(
      await post("/api/checklists/prune", { olderThanDays: 7, scope: "all" }),
      200,
      { deletedItems: 1, deletedGroups: 0 },
    );

    const afterAll = (await (await api.request("/api/checklists")).json()) as { checklists: Checklist[] };
    expect(afterAll.checklists[0]!.items.map(({ id }) => id)).toEqual([keepRecent.id]);

    // Once its last check ages out, the group goes with it.
    backdate(keepRecent.id, 30);
    await expectJson(
      await post("/api/checklists/prune", { olderThanDays: 7, scope: "all" }),
      200,
      { deletedItems: 1, deletedGroups: 1 },
    );
    expect(((await (await api.request("/api/checklists")).json()) as { checklists: Checklist[] }).checklists).toEqual([]);

    await expectJson(
      await post("/api/checklists/prune", { olderThanDays: 7, scope: "all" }),
      200,
      { deletedItems: 0, deletedGroups: 0 },
    );
  });

  it("stores a due date and a priority, and refuses malformed values", async () => {
    const list = await expectChecklist(await post("/api/checklists", { name: "Meta" }), 201);
    const item = await expectItem(await post(`/api/checklists/${list.id}/items`, { text: "Ship it" }), 201);

    const updated = await expectItem(
      await patch(`/api/checklists/items/${item.id}`, { dueDate: "2026-11-02", priority: "now" }),
      200,
      { dueDate: "2026-11-02", priority: "now" },
    );
    expect(updated.id).toBe(item.id);

    await expectItem(await patch(`/api/checklists/items/${item.id}`, { dueDate: null, priority: "low" }), 200, {
      dueDate: null,
      priority: "low",
    });

    for (const dueDate of ["2026-13-40", "2026-02-31", "2/11/2026", ""]) {
      await expectJson(await patch(`/api/checklists/items/${item.id}`, { dueDate }), 400, { error: "invalid_due_date" });
    }
    for (const priority of ["urgent", "HIGH", ""]) {
      await expectJson(await patch(`/api/checklists/items/${item.id}`, { priority }), 400, {
        error: "invalid_priority",
      });
    }
    await expectJson(await patch(`/api/checklists/items/${item.id}`, { priority: 4 }), 400, {
      error: "invalid_priority",
    });

    const stored = (await (await api.request("/api/checklists")).json()) as { checklists: Checklist[] };
    expect(stored.checklists[0]!.items[0]).toMatchObject({ dueDate: null, priority: "low" });
  });

  it("refuses an unusable retention policy", async () => {
    for (const olderThanDays of [0, -1, 7.5]) {
      await expectJson(await post("/api/checklists/prune", { olderThanDays, scope: "all" }), 400, {
        error: "invalid_retention",
      });
    }
    await expectJson(await post("/api/checklists/prune", { scope: "all" }), 400, { error: "invalid_retention" });
    await expectJson(await post("/api/checklists/prune", { olderThanDays: 7 }), 400, { error: "invalid_scope" });
    await expectJson(await post("/api/checklists/prune", { olderThanDays: 7, scope: "some" }), 400, {
      error: "invalid_scope",
    });
  });

  it("links a check to a goal and refuses an unknown one", async () => {
    const goalGroup = (await (await post("/api/goals/groups", { name: "Linked" })).json()) as { id: string };
    const goal = (await (await post(`/api/goals/groups/${goalGroup.id}/goals`, { title: "Feed the goal" })).json()) as {
      id: string;
    };
    const list = await expectChecklist(await post("/api/checklists", { name: "Work" }), 201);
    const item = await expectItem(await post(`/api/checklists/${list.id}/items`, { text: "Do the thing" }), 201);

    await expectItem(await patch(`/api/checklists/items/${item.id}`, { goalId: goal.id }), 200, { goalId: goal.id });
    await expectItem(await patch(`/api/checklists/items/${item.id}`, { goalId: null }), 200, { goalId: null });
    await expectJson(
      await patch(`/api/checklists/items/${item.id}`, { goalId: "00000000-0000-4000-8000-000000000000" }),
      400,
      { error: "invalid_goal" },
    );
    await expectJson(await patch(`/api/checklists/items/${item.id}`, { goalId: 4 }), 400, { error: "invalid_goal" });
  });
});
