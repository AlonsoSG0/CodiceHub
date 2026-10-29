import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import { app } from "../src/app.js";

type Tag = { id: string; name: string };
type Category = { id: string; name: string };
type GoalSummary = {
  id: string;
  groupId: string;
  title: string;
  category: Category | null;
  tags: Tag[];
  position: number;
  updatedAt: string;
};
type Goal = GoalSummary & { content: unknown; createdAt: string };
type GoalGroup = {
  id: string;
  name: string;
  position: number;
  periodStart: string | null;
  periodEnd: string | null;
  archivedAt: string | null;
  goals: GoalSummary[];
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

async function expectGroup(response: Response, status: number, expected: Partial<GoalGroup> = {}): Promise<GoalGroup> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const group = (await response.json()) as GoalGroup;
  expectKeys(group, ["id", "name", "position", "periodStart", "periodEnd", "archivedAt", "goals", "createdAt", "updatedAt"]);
  expect(group.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(group).toMatchObject(expected);
  return group;
}

async function expectGoal(response: Response, status: number, expected: Partial<Goal> = {}): Promise<Goal> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  const goal = (await response.json()) as Goal;
  expectKeys(goal, ["id", "groupId", "title", "category", "tags", "dueDate", "status", "position", "updatedAt", "content", "createdAt"]);
  expect(goal.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(goal).toMatchObject(expected);
  return goal;
}

describe("goals HTTP API", () => {
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
    directory = mkdtempSync(join(tmpdir(), "chub-goals-api-"));
    db = createDb(join(directory, "chub.db"));
    api = { request: (input, init) => app.request(input, init, { db }) };
  });

  afterEach(() => {
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates, updates, lists and deletes groups and goals with shared vocabularies", async () => {
    const personal = await expectGroup(await post("/api/goals/groups", { name: "Personal" }), 201, {
      name: "Personal",
      position: 0,
      goals: [],
    });
    const work = await expectGroup(await post("/api/goals/groups", { name: "Work" }), 201, {
      name: "Work",
      position: 1,
      goals: [],
    });
    const first = await expectGoal(await post(`/api/goals/groups/${personal.id}/goals`, { title: "Read daily" }), 201, {
      groupId: personal.id,
      title: "Read daily",
      position: 0,
      category: null,
      tags: [],
      content: { type: "doc", content: [] },
    });
    const second = await expectGoal(await post(`/api/goals/groups/${work.id}/goals`, { title: "Ship a feature" }), 201, {
      groupId: work.id,
      position: 0,
    });
    const third = await expectGoal(await post(`/api/goals/groups/${personal.id}/goals`, { title: "Walk more" }), 201, {
      groupId: personal.id,
      position: 1,
    });

    const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "One page" }] }] };
    const updatedFirst = await expectGoal(
      await patch(`/api/goals/items/${first.id}`, {
        title: "Read every day",
        content,
        categoryName: " #Life ",
        tagNames: [" #Focus ", "FOCUS", "Health"],
      }),
      200,
      { id: first.id, title: "Read every day", content },
    );
    expect(updatedFirst.category?.name).toBe("life");
    expect(updatedFirst.tags.map(({ name }) => name)).toEqual(["focus", "health"]);

    const updatedSecond = await expectGoal(
      await patch(`/api/goals/items/${second.id}`, { categoryName: "LIFE", tagNames: ["focus"] }),
      200,
      { id: second.id },
    );
    expect(updatedSecond.category?.id).toBe(updatedFirst.category?.id);
    expect(updatedSecond.tags.map(({ id }) => id)).toEqual([updatedFirst.tags[0].id]);
    const clearedSecond = await expectGoal(
      await patch(`/api/goals/items/${second.id}`, { categoryName: "" }),
      200,
      { id: second.id },
    );
    expect(clearedSecond.category).toBeNull();

    const replaced = await expectGoal(
      await patch(`/api/goals/items/${first.id}`, {
        categoryName: null,
        tagNames: ["Reading", " #reading ", "", "Deep Work"],
      }),
      200,
      { id: first.id },
    );
    expect(replaced.category).toBeNull();
    expect(replaced.tags.map(({ name }) => name)).toEqual(["deep work", "reading"]);

    const vocabulary = (await (await api.request("/api/goals/vocabulary")).json()) as {
      tags: Tag[];
      categories: Category[];
    };
    expectKeys(vocabulary, ["tags", "categories"]);
    expect(vocabulary.tags.map(({ name }) => name)).toEqual(["deep work", "focus", "health", "reading"]);
    expect(vocabulary.categories.map(({ name }) => name)).toEqual(["life"]);

    await expectGroup(await patch(`/api/goals/groups/${personal.id}`, { name: "Personal growth" }), 200, {
      id: personal.id,
      name: "Personal growth",
    });
    const listed = (await (await api.request("/api/goals")).json()) as { groups: GoalGroup[] };
    expectKeys(listed, ["groups"]);
    expect(listed.groups.map(({ id, position }) => [id, position])).toEqual([
      [personal.id, 0],
      [work.id, 1],
    ]);
    expect(listed.groups[0].goals.map(({ id, position }) => [id, position])).toEqual([
      [first.id, 0],
      [third.id, 1],
    ]);
    expect(listed.groups.flatMap(({ goals }) => goals).every((goal) => !Object.hasOwn(goal, "content"))).toBe(true);
    expect(listed.groups[0].goals[0]).toMatchObject({
      id: first.id,
      category: null,
      tags: [{ name: "deep work" }, { name: "reading" }],
    });
    await expectGoal(await api.request(`/api/goals/items/${first.id}`), 200, {
      id: first.id,
      content,
      category: null,
    });

    await expectJson(await api.request(`/api/goals/items/${third.id}`, { method: "DELETE" }), 200, {
      deleted: third.id,
    });
    await expectJson(await api.request(`/api/goals/groups/${work.id}`, { method: "DELETE" }), 200, {
      deleted: work.id,
    });
    await expectJson(await api.request(`/api/goals/items/${second.id}`), 404, { error: "goal_not_found" });
    expect((await (await api.request("/api/goals/vocabulary")).json()).tags).toEqual(vocabulary.tags);
    await expectJson(await api.request(`/api/goals/groups/${personal.id}`, { method: "DELETE" }), 200, {
      deleted: personal.id,
    });
    await expectJson(await api.request(`/api/goals/items/${first.id}`), 404, { error: "goal_not_found" });
    expect((await (await api.request("/api/goals")).json()).groups).toEqual([]);
  });

  it("returns every contract error without changing groups, goals, or append positions", async () => {
    const group = await expectGroup(await post("/api/goals/groups", { name: "Keep" }), 201, { position: 0 });
    const goal = await expectGoal(await post(`/api/goals/groups/${group.id}/goals`, { title: "Kept" }), 201, {
      position: 0,
    });
    const before = await api.request("/api/goals").then((response) => response.text());

    await expectJson(
      await api.request("/api/goals/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      400,
      { error: "invalid_body" },
    );
    await expectJson(await post("/api/goals/groups", []), 400, { error: "invalid_body" });
    await expectJson(await post("/api/goals/groups", {}), 400, { error: "invalid_name" });
    await expectJson(await post("/api/goals/groups", { name: "  " }), 400, { error: "invalid_name" });
    await expectJson(await patch(`/api/goals/groups/${group.id}`, { name: 3 }), 400, { error: "invalid_name" });
    await expectJson(await post(`/api/goals/groups/${group.id}/goals`, {}), 400, { error: "invalid_title" });
    await expectJson(await post(`/api/goals/groups/${group.id}/goals`, { title: "  " }), 400, { error: "invalid_title" });
    await expectJson(await patch(`/api/goals/items/${goal.id}`, { title: false }), 400, { error: "invalid_title" });
    await expectJson(await patch(`/api/goals/items/${goal.id}`, { tagNames: "focus" }), 400, { error: "invalid_tags" });
    await expectJson(await patch(`/api/goals/items/${goal.id}`, { tagNames: ["focus", 2] }), 400, {
      error: "invalid_tags",
    });
    await expectJson(await patch(`/api/goals/items/${goal.id}`, { categoryName: 2 }), 400, {
      error: "invalid_category",
    });

    const stringify = JSON.stringify;
    JSON.stringify = (value, replacer, space) => {
      if (typeof value === "object" && value !== null && Object.hasOwn(value, "notSerializable")) {
        throw new TypeError("not serializable");
      }
      return stringify(value, replacer, space);
    };
    try {
      await expectJson(await patch(`/api/goals/items/${goal.id}`, { content: { notSerializable: true } }), 400, {
        error: "invalid_content",
      });
    } finally {
      JSON.stringify = stringify;
    }
    await expectJson(await patch(`/api/goals/groups/${missingId}`, { name: "Missing" }), 404, {
      error: "group_not_found",
    });
    await expectJson(await api.request(`/api/goals/groups/${missingId}`, { method: "DELETE" }), 404, {
      error: "group_not_found",
    });
    await expectJson(await post(`/api/goals/groups/${missingId}/goals`, { title: "Missing" }), 404, {
      error: "group_not_found",
    });
    await expectJson(await api.request(`/api/goals/items/${missingId}`), 404, { error: "goal_not_found" });
    await expectJson(await patch(`/api/goals/items/${missingId}`, { title: "Missing" }), 404, {
      error: "goal_not_found",
    });
    await expectJson(await api.request(`/api/goals/items/${missingId}`, { method: "DELETE" }), 404, {
      error: "goal_not_found",
    });

    expect(await (await api.request("/api/goals")).text()).toBe(before);
    expect((await (await api.request("/api/goals/vocabulary")).json()).tags).toEqual([]);
    const appendedGroup = await expectGroup(await post("/api/goals/groups", { name: "Next" }), 201, { position: 1 });
    expect(appendedGroup.id).not.toBe(group.id);
    await expectGoal(await post(`/api/goals/groups/${group.id}/goals`, { title: "Next" }), 201, { position: 1 });
  });

  it("rejects content that is not a document without storing it", async () => {
    const group = await expectGroup(await post("/api/goals/groups", { name: "Keep" }), 201);
    const goal = await expectGoal(await post(`/api/goals/groups/${group.id}/goals`, { title: "Kept" }), 201);
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    await expectGoal(await patch(`/api/goals/items/${goal.id}`, { content }), 200, { content });
    const stored = await api.request(`/api/goals/items/${goal.id}`);

    for (const invalid of [null, "text", 42, [content]]) {
      await expectJson(await patch(`/api/goals/items/${goal.id}`, { content: invalid }), 400, {
        error: "invalid_content",
      });
    }

    expect(await (await api.request(`/api/goals/items/${goal.id}`)).text()).toBe(await stored.text());
  });

  it("keeps a period on a group, archives it, and refuses goals inside it", async () => {
    const created = await expectGroup(
      await post("/api/goals/groups", { name: "Q4", periodStart: "2026-10-01", periodEnd: "2026-12-31" }),
      201,
      { periodStart: "2026-10-01", periodEnd: "2026-12-31", archivedAt: null },
    );

    await expectGroup(
      await patch(`/api/goals/groups/${created.id}`, { periodEnd: "2027-03-31" }),
      200,
      { periodEnd: "2027-03-31" },
    );
    await expectGroup(
      await patch(`/api/goals/groups/${created.id}`, { periodStart: null, periodEnd: null }),
      200,
      { periodStart: null, periodEnd: null },
    );

    for (const body of [
      { periodStart: "2026-13-01" },
      { periodStart: "2026-12-31", periodEnd: "2026-01-01" },
      { periodStart: 4 },
    ]) {
      await expectJson(await patch(`/api/goals/groups/${created.id}`, body), 400, { error: "invalid_period" });
    }
    await expectJson(await patch(`/api/goals/groups/${created.id}`, { archived: "yes" }), 400, {
      error: "invalid_archived",
    });
    await expectJson(await patch(`/api/goals/groups/${created.id}`, {}), 400, { error: "invalid_body" });

    await expectGroup(await patch(`/api/goals/groups/${created.id}`, { archived: true }), 200, { archivedAt: expect.any(String) });

    const active = (await (await api.request("/api/goals")).json()) as { groups: GoalGroup[] };
    expect(active.groups.some(({ id }) => id === created.id)).toBe(false);
    const archived = (await (await api.request("/api/goals?archived=1")).json()) as { groups: GoalGroup[] };
    expect(archived.groups.map(({ id }) => id)).toContain(created.id);

    await expectJson(await post(`/api/goals/groups/${created.id}/goals`, { title: "Nope" }), 400, {
      error: "group_archived",
    });

    await expectGroup(await patch(`/api/goals/groups/${created.id}`, { archived: false }), 200, { archivedAt: null });
    const restored = (await (await api.request("/api/goals")).json()) as { groups: GoalGroup[] };
    expect(restored.groups.map(({ id }) => id)).toContain(created.id);
  });

  it("tracks a goal's own status and due date", async () => {
    const group = await expectGroup(await post("/api/goals/groups", { name: "Tracked" }), 201);
    const goal = await expectGoal(
      await post(`/api/goals/groups/${group.id}/goals`, { title: "Ship it" }),
      201,
      { status: "todo", dueDate: null },
    );

    await expectGoal(
      await patch(`/api/goals/items/${goal.id}`, { status: "doing", dueDate: "2026-12-01" }),
      200,
      { status: "doing", dueDate: "2026-12-01" },
    );
    await expectGoal(await patch(`/api/goals/items/${goal.id}`, { status: "done", dueDate: null }), 200, {
      status: "done",
      dueDate: null,
    });

    for (const status of ["later", "DONE", ""]) {
      await expectJson(await patch(`/api/goals/items/${goal.id}`, { status }), 400, { error: "invalid_status" });
    }
    for (const dueDate of ["2026-02-31", "next week", ""]) {
      await expectJson(await patch(`/api/goals/items/${goal.id}`, { dueDate }), 400, {
        error: "invalid_due_date",
      });
    }
  });

  it("moves a group by position and refuses a negative one", async () => {
    const first = await expectGroup(await post("/api/goals/groups", { name: "First" }), 201, { position: 0 });
    const second = await expectGroup(await post("/api/goals/groups", { name: "Second" }), 201, { position: 1 });

    await expectGroup(await patch(`/api/goals/groups/${second.id}`, { position: 0 }), 200, { position: 0 });
    await expectGroup(await patch(`/api/goals/groups/${first.id}`, { position: 1 }), 200, { position: 1 });
    const listed = (await (await api.request("/api/goals")).json()) as { groups: GoalGroup[] };
    expect(listed.groups.map(({ name }) => name)).toEqual(["Second", "First"]);

    await expectJson(await patch(`/api/goals/groups/${first.id}`, { position: -1 }), 400, {
      error: "invalid_position",
    });
    await expectJson(await patch(`/api/goals/groups/${first.id}`, { position: "2" }), 400, {
      error: "invalid_position",
    });
  });
});
