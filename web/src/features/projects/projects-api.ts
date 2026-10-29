/**
 * The projects section talks to the server through these helpers only.
 *
 * The shapes mirror the server's own types one to one, so a column, a task and a project read the same
 * here and there. `dueDate` is a plain `YYYY-MM-DD` calendar day: the server stores the exact string and
 * compares it lexicographically, so nothing in this file may ever turn it into a `Date`.
 */

export type ProjectPriority = "none" | "low" | "medium" | "high" | "now";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Column = {
  id: string;
  projectId: string;
  name: string;
  isCompleted: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: ProjectPriority;
  goalId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

/** One column of the project list, with the load it carries. */
export type SummaryColumn = {
  id: string;
  name: string;
  isCompleted: boolean;
  taskCount: number;
};

/** A project as the section home sees it: the project plus the shape of its work. */
export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  doneTaskCount: number;
  columns: SummaryColumn[];
};

export type Board = {
  project: Project;
  columns: Column[];
  tasks: Task[];
};

/**
 * A task as the board sees it.
 *
 * `name` and `column` are the two fields Kibo UI's kanban reads: the first is the card's label and the
 * second is the column it belongs to, which is what a drag rewrites. The rest is the task's own data.
 */
export type BoardTask = {
  id: string;
  name: string;
  column: string;
  description: string | null;
  dueDate: string | null;
  priority: ProjectPriority;
  goalId: string | null;
  isCompleted: boolean;
};

/** A task as the calendar sees it: due on a day, inside a column, inside a project. */
export type CalendarTask = {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  columnId: string;
  columnName: string;
  isCompleted: boolean;
};

export type CreateProjectInput = {
  name: string;
  description?: string | null;
};

export type UpdateProjectInput = {
  name?: string;
  description?: string | null;
  archived?: boolean;
};

export type CreateColumnInput = {
  name: string;
  isCompleted?: boolean;
};

export type UpdateColumnInput = {
  name?: string;
  isCompleted?: boolean;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  columnId?: string;
  priority?: ProjectPriority;
  goalId?: string | null;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  columnId?: string;
  priority?: ProjectPriority;
  goalId?: string | null;
};

/** The whole board in one move: the ordered columns and the ordered tasks of each column. */
export type Layout = {
  columns: string[];
  tasks: Array<{ id: string; columnId: string }>;
};

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

function jsonInit(method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function fetchProjects(archived = false): Promise<ProjectSummary[]> {
  const response = await requestJson<{ projects: ProjectSummary[] }>(`/api/projects${archived ? "?archived=1" : ""}`);
  return response.projects;
}

export function fetchProject(id: string): Promise<Project> {
  return requestJson<Project>(`/api/projects/${encodeURIComponent(id)}`);
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return requestJson<Project>("/api/projects", jsonInit("POST", input));
}

export function updateProject(id: string, patch: UpdateProjectInput): Promise<Project> {
  return requestJson<Project>(`/api/projects/${encodeURIComponent(id)}`, jsonInit("PATCH", patch));
}

export function deleteProject(id: string): Promise<void> {
  return requestJson<void>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchBoard(projectId: string): Promise<Board> {
  return requestJson<Board>(`/api/projects/${encodeURIComponent(projectId)}/board`);
}

/** Persists the whole board layout in one request, so a drop never writes card by card. */
export function saveLayout(projectId: string, layout: Layout): Promise<Pick<Board, "columns" | "tasks">> {
  return requestJson<Pick<Board, "columns" | "tasks">>(
    `/api/projects/${encodeURIComponent(projectId)}/layout`,
    jsonInit("PUT", layout),
  );
}

export function createColumn(projectId: string, input: CreateColumnInput): Promise<Column> {
  return requestJson<Column>(`/api/projects/${encodeURIComponent(projectId)}/columns`, jsonInit("POST", input));
}

export function updateColumn(id: string, patch: UpdateColumnInput): Promise<Column> {
  return requestJson<Column>(`/api/columns/${encodeURIComponent(id)}`, jsonInit("PATCH", patch));
}

export function deleteColumn(id: string): Promise<void> {
  return requestJson<void>(`/api/columns/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function createTask(projectId: string, input: CreateTaskInput): Promise<Task> {
  return requestJson<Task>(`/api/projects/${encodeURIComponent(projectId)}/tasks`, jsonInit("POST", input));
}

export function updateTask(id: string, patch: UpdateTaskInput): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}`, jsonInit("PATCH", patch));
}

export function deleteTask(id: string): Promise<void> {
  return requestJson<void>(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchCalendarTasks(from: string, to: string): Promise<CalendarTask[]> {
  const query = new URLSearchParams({ from, to });
  return requestJson<{ tasks: CalendarTask[] }>(`/api/tasks?${query.toString()}`).then((response) => response.tasks);
}

/** Board tasks that serve one goal: the bridge the goal page reads. */
export type GoalLinkedTask = {
  id: string;
  title: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  columnId: string;
  columnName: string;
  isCompleted: boolean;
};

export function fetchTasksByGoal(goalId: string): Promise<GoalLinkedTask[]> {
  const query = new URLSearchParams({ goalId });
  return requestJson<{ tasks: GoalLinkedTask[] }>(`/api/tasks?${query.toString()}`).then((response) => response.tasks);
}
