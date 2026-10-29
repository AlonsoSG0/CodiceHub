import type { JSONContent } from "@tiptap/react";

export type GoalGroup = {
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

export type GoalStatus = "todo" | "doing" | "done";

export type GoalSummary = {
  id: string;
  groupId: string;
  title: string;
  category: Category | null;
  tags: Tag[];
  dueDate: string | null;
  status: GoalStatus;
  position: number;
  updatedAt: string;
};

export type Goal = GoalSummary & {
  content: JSONContent;
  createdAt: string;
};

export type Tag = { id: string; name: string };
export type Category = { id: string; name: string };

export type CreateGroupInput = { name: string; periodStart?: string | null; periodEnd?: string | null };
export type UpdateGroupInput = {
  name?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  archived?: boolean;
  position?: number;
};
export type CreateGoalInput = { title: string };
export type UpdateGoalInput = {
  title?: string;
  content?: JSONContent;
  categoryName?: string | null;
  tagNames?: string[];
  dueDate?: string | null;
  status?: GoalStatus;
};
export type GoalVocabulary = { tags: Tag[]; categories: Category[] };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const code =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `http_${response.status}`;
    throw new Error(code);
  }
  return body as T;
}

function jsonInit(method: "POST" | "PATCH", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function groupPath(id: string, suffix = ""): string {
  return `/api/goals/groups/${encodeURIComponent(id)}${suffix}`;
}

function goalPath(id: string): string {
  return `/api/goals/items/${encodeURIComponent(id)}`;
}

export async function fetchGoals(archived = false): Promise<GoalGroup[]> {
  const response = await requestJson<{ groups: GoalGroup[] }>(`/api/goals${archived ? "?archived=1" : ""}`);
  return response.groups;
}

export function createGoalGroup(input: CreateGroupInput): Promise<GoalGroup> {
  return requestJson<GoalGroup>("/api/goals/groups", jsonInit("POST", input));
}

export function updateGoalGroup(id: string, patch: UpdateGroupInput): Promise<GoalGroup> {
  return requestJson<GoalGroup>(groupPath(id), jsonInit("PATCH", patch));
}

export function deleteGoalGroup(id: string): Promise<{ deleted: string }> {
  return requestJson<{ deleted: string }>(groupPath(id), { method: "DELETE" });
}

export function createGoal(groupId: string, input: CreateGoalInput): Promise<Goal> {
  return requestJson<Goal>(groupPath(groupId, "/goals"), jsonInit("POST", input));
}

export function fetchGoal(id: string): Promise<Goal> {
  return requestJson<Goal>(goalPath(id));
}

export function updateGoal(id: string, patch: UpdateGoalInput): Promise<Goal> {
  return requestJson<Goal>(goalPath(id), jsonInit("PATCH", patch));
}

export function deleteGoal(id: string): Promise<{ deleted: string }> {
  return requestJson<{ deleted: string }>(goalPath(id), { method: "DELETE" });
}

export function fetchGoalVocabulary(): Promise<GoalVocabulary> {
  return requestJson<GoalVocabulary>("/api/goals/vocabulary");
}
