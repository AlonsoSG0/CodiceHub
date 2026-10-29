import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { ChubDatabase } from "../db/client.js";
import {
  goals,
  projectColumns,
  projects,
  tasks,
  type ProjectColumnRow,
  type ProjectRow,
  type TaskRow,
} from "../db/schema.js";

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

export type ProjectPriority = "none" | "low" | "medium" | "high" | "now";

const projectPriorities: ReadonlySet<string> = new Set(["none", "low", "medium", "high", "now"]);

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

export type ProjectSummary = Project & {
  taskCount: number;
  doneTaskCount: number;
  columns: Array<{ id: string; name: string; isCompleted: boolean; taskCount: number }>;
};

export type LinkedTask = {
  id: string;
  title: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  columnId: string;
  columnName: string;
  isCompleted: boolean;
};

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

export type ProjectBoard = { project: Project; columns: Column[]; tasks: Task[] };
export type CreateProjectInput = { name: string; description?: string | null };
export type UpdateProjectInput = { name?: string; description?: string | null; archived?: boolean };
export type CreateColumnInput = { name: string; isCompleted?: boolean };
export type UpdateColumnInput = { name?: string; isCompleted?: boolean };
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
export type ProjectLayoutInput = { columns: string[]; tasks: Array<{ id: string; columnId: string }> };

export type ProjectErrorCode =
  | "project_not_found"
  | "column_not_found"
  | "task_not_found"
  | "unknown_column"
  | "unknown_task"
  | "last_column"
  | "invalid_priority"
  | "invalid_goal";

export class ProjectError extends Error {
  constructor(readonly code: ProjectErrorCode) {
    super(code);
    this.name = "ProjectError";
  }
}

export interface ProjectsRepository {
  list(archived?: boolean): ProjectSummary[];
  getBoard(id: string): ProjectBoard;
  create(input: CreateProjectInput): Project;
  update(id: string, input: UpdateProjectInput): Project;
  remove(id: string): void;
  applyLayout(id: string, input: ProjectLayoutInput): { columns: Column[]; tasks: Task[] };
  createColumn(projectId: string, input: CreateColumnInput): Column;
  updateColumn(id: string, input: UpdateColumnInput): Column;
  removeColumn(id: string): void;
  createTask(projectId: string, input: CreateTaskInput): Task;
  updateTask(id: string, input: UpdateTaskInput): Task;
  removeTask(id: string): void;
  calendar(from: string, to: string): CalendarTask[];
  byGoal(goalId: string): LinkedTask[];
}

function now(): string {
  return new Date().toISOString();
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toColumn(row: ProjectColumnRow): Column {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    isCompleted: row.isCompleted,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    columnId: row.columnId,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    priority: row.priority as ProjectPriority,
    goalId: row.goalId,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type CalendarRow = {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  columnId: string;
  columnName: string;
  isCompleted: number;
};

export function createProjectsRepository(db: ChubDatabase): ProjectsRepository {
  const findProject = (id: string): ProjectRow | undefined => db.select().from(projects).where(eq(projects.id, id)).get();
  const requireProject = (id: string): ProjectRow => {
    const row = findProject(id);
    if (!row) throw new ProjectError("project_not_found");
    return row;
  };
  const findColumn = (id: string): ProjectColumnRow | undefined =>
    db.select().from(projectColumns).where(eq(projectColumns.id, id)).get();
  const requireColumn = (id: string): ProjectColumnRow => {
    const row = findColumn(id);
    if (!row) throw new ProjectError("column_not_found");
    return row;
  };
  const findTask = (id: string): TaskRow | undefined => db.select().from(tasks).where(eq(tasks.id, id)).get();
  const requireTask = (id: string): TaskRow => {
    const row = findTask(id);
    if (!row) throw new ProjectError("task_not_found");
    return row;
  };
  const columnsFor = (projectId: string): ProjectColumnRow[] =>
    db
      .select()
      .from(projectColumns)
      .where(eq(projectColumns.projectId, projectId))
      .orderBy(asc(projectColumns.position), asc(projectColumns.id))
      .all();
  const tasksFor = (projectId: string): TaskRow[] =>
    db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(asc(tasks.position), asc(tasks.id)).all();
  const tasksInColumn = (columnId: string): TaskRow[] =>
    db.select().from(tasks).where(eq(tasks.columnId, columnId)).orderBy(asc(tasks.position), asc(tasks.id)).all();

  const writeTaskOrder = (rows: TaskRow[], columnId: string, timestamp: string): void => {
    const update = db.$client.prepare("UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?");
    rows.forEach((row, position) => {
      if (row.columnId !== columnId || row.position !== position) update.run(columnId, position, timestamp, row.id);
    });
  };

  return {
    list(archived = false): ProjectSummary[] {
      const projectRows = db
        .select()
        .from(projects)
        .orderBy(asc(projects.createdAt), asc(projects.id))
        .all()
        .filter((row) => (archived ? row.archivedAt !== null : row.archivedAt === null));
      const columnRows = db.select().from(projectColumns).orderBy(asc(projectColumns.position), asc(projectColumns.id)).all();
      const taskRows = db.select().from(tasks).all();
      const taskCountByProject = new Map<string, number>();
      const taskCountByColumn = new Map<string, number>();
      const completedByColumn = new Map(columnRows.map((column) => [column.id, column.isCompleted]));
      const doneCountByProject = new Map<string, number>();

      for (const task of taskRows) {
        taskCountByProject.set(task.projectId, (taskCountByProject.get(task.projectId) ?? 0) + 1);
        taskCountByColumn.set(task.columnId, (taskCountByColumn.get(task.columnId) ?? 0) + 1);
        if (completedByColumn.get(task.columnId)) {
          doneCountByProject.set(task.projectId, (doneCountByProject.get(task.projectId) ?? 0) + 1);
        }
      }

      const columnsByProject = new Map<string, ProjectColumnRow[]>();
      for (const column of columnRows) {
        const projectColumnsForProject = columnsByProject.get(column.projectId) ?? [];
        projectColumnsForProject.push(column);
        columnsByProject.set(column.projectId, projectColumnsForProject);
      }

      return projectRows.map((row) => ({
        ...toProject(row),
        taskCount: taskCountByProject.get(row.id) ?? 0,
        doneTaskCount: doneCountByProject.get(row.id) ?? 0,
        columns: (columnsByProject.get(row.id) ?? []).map((column) => ({
          id: column.id,
          name: column.name,
          isCompleted: column.isCompleted,
          taskCount: taskCountByColumn.get(column.id) ?? 0,
        })),
      }));
    },

    getBoard(id): ProjectBoard {
      const project = toProject(requireProject(id));
      const columnRows = columnsFor(id);
      const columnPositions = new Map(columnRows.map((column) => [column.id, column.position]));
      const taskRows = tasksFor(id).sort(
        (left, right) =>
          (columnPositions.get(left.columnId) ?? 0) - (columnPositions.get(right.columnId) ?? 0) ||
          left.position - right.position ||
          left.id.localeCompare(right.id)
      );
      return { project, columns: columnRows.map(toColumn), tasks: taskRows.map(toTask) };
    },

    create(input): Project {
      const create = db.$client.transaction(() => {
        const id = randomUUID();
        const timestamp = now();
        db.$client
          .prepare("INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
          .run(id, input.name, input.description ?? null, timestamp, timestamp);
        const insertColumn = db.$client.prepare(
          "INSERT INTO project_columns (id, project_id, name, is_completed, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        const seeded = [
          { name: "Backlog", isCompleted: 0 },
          { name: "In progress", isCompleted: 0 },
          { name: "Done", isCompleted: 1 },
        ];
        seeded.forEach((column, position) =>
          insertColumn.run(randomUUID(), id, column.name, column.isCompleted, position, timestamp, timestamp)
        );
        return toProject(requireProject(id));
      });
      return create.immediate();
    },

    update(id, input): Project {
      const update = db.$client.transaction(() => {
        const row = requireProject(id);
        db.$client
          .prepare("UPDATE projects SET name = ?, description = ?, archived_at = ?, updated_at = ? WHERE id = ?")
          .run(
            input.name ?? row.name,
            input.description === undefined ? row.description : input.description,
            input.archived === undefined ? row.archivedAt : (input.archived ? now() : null),
            now(),
            id,
          );
        return toProject(requireProject(id));
      });
      return update.immediate();
    },

    remove(id): void {
      const remove = db.$client.transaction(() => {
        requireProject(id);
        db.$client.prepare("DELETE FROM projects WHERE id = ?").run(id);
      });
      remove.immediate();
    },

    applyLayout(id, input): { columns: Column[]; tasks: Task[] } {
      const apply = db.$client.transaction(() => {
        requireProject(id);
        const columnRows = columnsFor(id);
        const columnsById = new Map(columnRows.map((column) => [column.id, column]));
        for (const columnId of input.columns) {
          if (!columnsById.has(columnId)) throw new ProjectError("unknown_column");
        }
        const listedColumnIds = new Set(input.columns);
        const orderedColumns = [
          ...input.columns.map((columnId, position) => ({ column: columnsById.get(columnId)!, position, listed: true })),
          ...columnRows
            .filter((column) => !listedColumnIds.has(column.id))
            .map((column) => ({ column, position: column.position, listed: false })),
        ].sort(
          (left, right) =>
            left.position - right.position ||
            Number(right.listed) - Number(left.listed) ||
            left.column.id.localeCompare(right.column.id)
        );
        const timestamp = now();
        const updateColumnPosition = db.$client.prepare("UPDATE project_columns SET position = ?, updated_at = ? WHERE id = ?");
        orderedColumns.forEach(({ column }, position) => {
          if (column.position !== position) updateColumnPosition.run(position, timestamp, column.id);
        });

        const taskRows = tasksFor(id);
        const tasksById = new Map(taskRows.map((task) => [task.id, task]));
        const listedTaskPositions = new Map<string, number>();
        const nextPositionByColumn = new Map<string, number>();
        const targetColumnByTask = new Map<string, string>();
        const listedTaskIds = new Set<string>();
        for (const placement of input.tasks) {
          const task = tasksById.get(placement.id);
          if (!task) throw new ProjectError("unknown_task");
          if (!columnsById.has(placement.columnId)) throw new ProjectError("unknown_column");
          listedTaskIds.add(placement.id);
          targetColumnByTask.set(placement.id, placement.columnId);
          listedTaskPositions.set(placement.id, nextPositionByColumn.get(placement.columnId) ?? 0);
          nextPositionByColumn.set(placement.columnId, (nextPositionByColumn.get(placement.columnId) ?? 0) + 1);
        }

        const nextTasksByColumn = new Map<string, TaskRow[]>();
        for (const column of columnRows) {
          const members = taskRows
            .filter((task) => (targetColumnByTask.get(task.id) ?? task.columnId) === column.id)
            .map((task) => ({
              task,
              position: listedTaskPositions.get(task.id) ?? task.position,
              listed: listedTaskIds.has(task.id),
            }))
            .sort(
              (left, right) =>
                left.position - right.position ||
                Number(right.listed) - Number(left.listed) ||
                left.task.position - right.task.position ||
                left.task.id.localeCompare(right.task.id)
            );
          nextTasksByColumn.set(column.id, members.map(({ task }) => task));
        }
        for (const column of columnRows) {
          writeTaskOrder(nextTasksByColumn.get(column.id) ?? [], column.id, timestamp);
        }

        const updatedColumns = columnsFor(id).map(toColumn);
        const updatedTasks = tasksFor(id)
          .sort(
            (left, right) =>
              (updatedColumns.find((column) => column.id === left.columnId)?.position ?? 0) -
                (updatedColumns.find((column) => column.id === right.columnId)?.position ?? 0) ||
              left.position - right.position ||
              left.id.localeCompare(right.id)
          )
          .map(toTask);
        return { columns: updatedColumns, tasks: updatedTasks };
      });
      return apply.immediate();
    },

    createColumn(projectId, input): Column {
      const create = db.$client.transaction(() => {
        requireProject(projectId);
        const current = columnsFor(projectId);
        const id = randomUUID();
        const timestamp = now();
        db.$client
          .prepare(
            "INSERT INTO project_columns (id, project_id, name, is_completed, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .run(id, projectId, input.name, input.isCompleted ? 1 : 0, current.length, timestamp, timestamp);
        return toColumn(requireColumn(id));
      });
      return create.immediate();
    },

    updateColumn(id, input): Column {
      const update = db.$client.transaction(() => {
        const row = requireColumn(id);
        db.$client
          .prepare("UPDATE project_columns SET name = ?, is_completed = ?, updated_at = ? WHERE id = ?")
          .run(input.name ?? row.name, input.isCompleted === undefined ? Number(row.isCompleted) : Number(input.isCompleted), now(), id);
        return toColumn(requireColumn(id));
      });
      return update.immediate();
    },

    removeColumn(id): void {
      const remove = db.$client.transaction(() => {
        const column = requireColumn(id);
        const siblings = columnsFor(column.projectId);
        if (siblings.length === 1) throw new ProjectError("last_column");
        const remaining = siblings.filter((candidate) => candidate.id !== id);
        const destination = remaining[0];
        const timestamp = now();
        const updateColumnPosition = db.$client.prepare("UPDATE project_columns SET position = ?, updated_at = ? WHERE id = ?");
        remaining.forEach((candidate, position) => {
          if (candidate.position !== position) updateColumnPosition.run(position, timestamp, candidate.id);
        });

        const destinationTasks = tasksInColumn(destination.id);
        const removedColumnTasks = tasksInColumn(id);
        writeTaskOrder([...destinationTasks, ...removedColumnTasks], destination.id, timestamp);
        db.$client.prepare("DELETE FROM project_columns WHERE id = ?").run(id);
      });
      remove.immediate();
    },

    createTask(projectId, input): Task {
      const create = db.$client.transaction(() => {
        requireProject(projectId);
        const projectColumnRows = columnsFor(projectId);
        const columnId = input.columnId ?? projectColumnRows[0]?.id;
        const column = columnId === undefined ? undefined : findColumn(columnId);
        if (!column || column.projectId !== projectId) throw new ProjectError("unknown_column");
        const id = randomUUID();
        const timestamp = now();
        const position = tasksInColumn(columnId).length;
        db.$client
          .prepare(
            "INSERT INTO tasks (id, project_id, column_id, title, description, due_date, priority, goal_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .run(
            id,
            projectId,
            columnId,
            input.title,
            input.description ?? null,
            input.dueDate ?? null,
            input.priority ?? "none",
            input.goalId ?? null,
            position,
            timestamp,
            timestamp,
          );
        return toTask(requireTask(id));
      });
      return create.immediate();
    },

    updateTask(id, input): Task {
      if (input.priority !== undefined && !projectPriorities.has(input.priority)) {
        throw new ProjectError("invalid_priority");
      }
      if (input.goalId !== undefined && input.goalId !== null) {
        const goal = db.select({ id: goals.id }).from(goals).where(eq(goals.id, input.goalId)).get();
        if (goal === undefined) throw new ProjectError("invalid_goal");
      }
      const update = db.$client.transaction(() => {
        const row = requireTask(id);
        const timestamp = now();
        const targetColumn = input.columnId === undefined || input.columnId === row.columnId
          ? null
          : requireColumn(input.columnId);
        if (targetColumn !== null && targetColumn.projectId !== row.projectId) {
          throw new ProjectError("unknown_column");
        }

        db.$client
          .prepare(
            "UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ?, goal_id = ?, column_id = ?, position = ?, updated_at = ? WHERE id = ?"
          )
          .run(
            input.title ?? row.title,
            input.description === undefined ? row.description : input.description,
            input.dueDate === undefined ? row.dueDate : input.dueDate,
            input.priority === undefined ? row.priority : input.priority,
            input.goalId === undefined ? row.goalId : input.goalId,
            targetColumn === null ? row.columnId : targetColumn.id,
            targetColumn === null ? row.position : tasksInColumn(targetColumn.id).length,
            timestamp,
            id
          );

        // A card that changes column is appended to the target and the source closes the gap.
        if (targetColumn !== null) {
          writeTaskOrder(tasksInColumn(row.columnId).filter((task) => task.id !== id), row.columnId, timestamp);
        }
        return toTask(requireTask(id));
      });
      return update.immediate();
    },

    /** Every board task that serves one goal, across projects: the bridge the goal page reads. */
    byGoal(goalId): LinkedTask[] {
      const rows = db.$client
        .prepare(
          "SELECT tasks.id AS id, tasks.title AS title, tasks.due_date AS dueDate, tasks.project_id AS projectId, projects.name AS projectName, tasks.column_id AS columnId, project_columns.name AS columnName, project_columns.is_completed AS isCompleted FROM tasks JOIN projects ON projects.id = tasks.project_id JOIN project_columns ON project_columns.id = tasks.column_id WHERE tasks.goal_id = ? ORDER BY projects.created_at ASC, tasks.position ASC"
        )
        .all(goalId) as CalendarRow[];
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.dueDate,
        projectId: row.projectId,
        projectName: row.projectName,
        columnId: row.columnId,
        columnName: row.columnName,
        isCompleted: row.isCompleted === 1,
      }));
    },

    removeTask(id): void {
      const remove = db.$client.transaction(() => {
        const row = requireTask(id);
        db.$client.prepare("DELETE FROM tasks WHERE id = ?").run(id);
        writeTaskOrder(tasksInColumn(row.columnId), row.columnId, now());
      });
      remove.immediate();
    },

    calendar(from, to): CalendarTask[] {
      const rows = db.$client
        .prepare(
          "SELECT tasks.id AS id, tasks.title AS title, tasks.due_date AS dueDate, tasks.project_id AS projectId, projects.name AS projectName, tasks.column_id AS columnId, project_columns.name AS columnName, project_columns.is_completed AS isCompleted FROM tasks JOIN projects ON projects.id = tasks.project_id JOIN project_columns ON project_columns.id = tasks.column_id WHERE tasks.due_date IS NOT NULL AND tasks.due_date >= ? AND tasks.due_date <= ? ORDER BY tasks.due_date ASC, projects.created_at ASC"
        )
        .all(from, to) as CalendarRow[];
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.dueDate,
        projectId: row.projectId,
        projectName: row.projectName,
        columnId: row.columnId,
        columnName: row.columnName,
        isCompleted: row.isCompleted === 1,
      }));
    },
  };
}
