export type Checklist = {
  id: string;
  name: string;
  position: number;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
};

export type ChecklistPriority = "none" | "low" | "medium" | "high" | "now";
export type ChecklistRecurrence = "none" | "daily" | "weekly";
export type ChecklistBulkAction = "complete-open" | "delete-completed";

export type ChecklistItem = {
  id: string;
  listId: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  priority: ChecklistPriority;
  recurrence: ChecklistRecurrence;
  goalId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateChecklistInput = { name: string };
export type UpdateChecklistInput = { name?: string };
export type CreateChecklistItemInput = { text: string };
export type UpdateChecklistItemInput = { text?: string; done?: boolean; dueDate?: string | null; priority?: ChecklistPriority; recurrence?: ChecklistRecurrence; goalId?: string | null };

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

function checklistPath(id: string, suffix = ""): string {
  return `/api/checklists/${encodeURIComponent(id)}${suffix}`;
}

function checklistItemPath(id: string): string {
  return `/api/checklists/items/${encodeURIComponent(id)}`;
}

export async function fetchChecklists(): Promise<Checklist[]> {
  const response = await requestJson<{ checklists: Checklist[] }>("/api/checklists");
  return response.checklists;
}

export function createChecklist(input: CreateChecklistInput): Promise<Checklist> {
  return requestJson<Checklist>("/api/checklists", jsonInit("POST", input));
}

export function updateChecklist(id: string, patch: UpdateChecklistInput): Promise<Checklist> {
  return requestJson<Checklist>(checklistPath(id), jsonInit("PATCH", patch));
}

export function deleteChecklist(id: string): Promise<{ deleted: string }> {
  return requestJson<{ deleted: string }>(checklistPath(id), { method: "DELETE" });
}

export function createChecklistItem(listId: string, input: CreateChecklistItemInput): Promise<ChecklistItem> {
  return requestJson<ChecklistItem>(checklistPath(listId, "/items"), jsonInit("POST", input));
}

export function updateChecklistItem(id: string, patch: UpdateChecklistItemInput): Promise<ChecklistItem> {
  return requestJson<ChecklistItem>(checklistItemPath(id), jsonInit("PATCH", patch));
}

export function deleteChecklistItem(id: string): Promise<{ deleted: string }> {
  return requestJson<{ deleted: string }>(checklistItemPath(id), { method: "DELETE" });
}

export type PruneInput = { olderThanDays: number; scope: "all" | "completed" };
export type PruneResult = { deletedItems: number; deletedGroups: number };

export function pruneChecklists(input: PruneInput): Promise<PruneResult> {
  return requestJson<PruneResult>("/api/checklists/prune", jsonInit("POST", input));
}

export function bulkChecklists(id: string, action: ChecklistBulkAction): Promise<Checklist> {
  return requestJson<Checklist>(checklistPath(id, "/bulk"), jsonInit("POST", { action }));
}
