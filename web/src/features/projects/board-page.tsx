import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, LayoutGrid, Plus, Search } from "lucide-react";
import type { DragOverEvent } from "@dnd-kit/core";
import { KanbanProvider } from "@/components/kibo-ui/kanban";
import { priorityStyles } from "@/components/priority-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fetchGoals } from "@/features/goals/goals-api";
import { BoardColumn } from "./board-column";
import { ColumnDialog, type ColumnValues } from "./column-dialog";
import { TaskDialog, type TaskValues } from "./task-dialog";
import { TasksCalendar } from "./tasks-calendar";
import { isOverdue } from "./due";
import {
  createColumn,
  createTask,
  deleteColumn,
  deleteTask,
  fetchBoard,
  saveLayout,
  updateColumn,
  updateTask,
  type Board,
  type BoardTask,
  type Column,
  type Layout,
  type ProjectPriority,
  type Task,
} from "./projects-api";

const boardFrameClassName =
  "relative flex h-dvh w-full min-w-0 flex-col overflow-hidden px-4 pt-5 pb-4 sm:px-6 sm:pt-7 sm:pb-6 lg:px-8 lg:pt-8";

/** The board's flat task list, grouped by column and ordered by the columns themselves. */
function orderTasks(columns: Column[], tasks: BoardTask[]): BoardTask[] {
  const grouped = new Map<string, BoardTask[]>();
  for (const task of tasks) {
    const list = grouped.get(task.column) ?? [];
    list.push(task);
    grouped.set(task.column, list);
  }

  const ordered: BoardTask[] = [];
  for (const column of [...columns].sort((left, right) => left.position - right.position)) {
    ordered.push(...(grouped.get(column.id) ?? []));
  }
  return ordered;
}

/** A task's finished state is the state of the column it sits in, and nothing else. */
function withCompletion(columns: Column[], tasks: BoardTask[]): BoardTask[] {
  const completed = new Map(columns.map((column) => [column.id, column.isCompleted]));
  return tasks.map((task) => ({ ...task, isCompleted: completed.get(task.column) ?? false }));
}

function toBoardTasks(board: Board): BoardTask[] {
  const columns = [...board.columns].sort((left, right) => left.position - right.position);
  const completed = new Map(columns.map((column) => [column.id, column.isCompleted]));

  return orderTasks(
    columns,
    board.tasks.map((task) => ({
      id: task.id,
      name: task.title,
      column: task.columnId,
      description: task.description,
      dueDate: task.dueDate,
      priority: task.priority,
      goalId: task.goalId,
      isCompleted: completed.get(task.columnId) ?? false,
    })),
  );
}

/** The whole board as the server wants it: the ordered columns and the ordered tasks of each column. */
function layoutOf(columns: Column[], tasks: BoardTask[]): Layout {
  return {
    columns: [...columns].sort((left, right) => left.position - right.position).map((column) => column.id),
    tasks: tasks.map((task) => ({ id: task.id, columnId: task.column })),
  };
}

function sameLayout(left: Layout, right: Layout): boolean {
  if (left.columns.length !== right.columns.length) return false;
  if (left.columns.some((id, index) => id !== right.columns[index])) return false;
  if (left.tasks.length !== right.tasks.length) return false;
  return left.tasks.every((task, index) => {
    const other = right.tasks[index];
    return task.id === other.id && task.columnId === other.columnId;
  });
}

function toBoardTask(task: Task): BoardTask {
  return {
    id: task.id,
    name: task.title,
    column: task.columnId,
    description: task.description,
    dueDate: task.dueDate,
    priority: task.priority,
    goalId: task.goalId,
    isCompleted: false,
  };
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function BoardPage() {
  const { t } = useT();
  const { projectId = "" } = useParams();
  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [goalNames, setGoalNames] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  const [view, setView] = useState<"board" | "calendar">("board");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<ProjectPriority | "all">("all");
  const [goalFilter, setGoalFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<BoardTask | null>(null);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [undo, setUndo] = useState<{ task: BoardTask } | null>(null);
  const undoTimer = useRef<number | null>(null);

  const columns = useMemo(() => board?.columns ?? [], [board]);
  const today = todayKey();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchBoard(projectId);
      setBoard(next);
      setTasks(toBoardTasks(next));
      try {
        const groups = await fetchGoals();
        setGoalNames(groups.flatMap((group) => group.goals.map((goal) => ({ id: goal.id, title: goal.title }))));
      } catch {
        // A goal name is context: losing it must not take the board down.
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The layout is written once per change, not once per card.
   *
   * The drag rewrites the flat task list in memory, and the board is saved when the layout differs from
   * what the server last confirmed. A drop is therefore one request, whatever it moved.
   */
  const persistedLayout = useRef<Layout | null>(null);

  useEffect(() => {
    if (board === null || isDragging) return;

    const layout = layoutOf(columns, tasks);
    const previous = persistedLayout.current;
    if (previous === null) {
      persistedLayout.current = layout;
      return;
    }
    if (sameLayout(previous, layout)) return;

    persistedLayout.current = layout;
    void saveLayout(projectId, layout).catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : "unknown_error");
    });
  }, [board, columns, isDragging, projectId, tasks]);

  const handleDataChange = useCallback(
    (next: BoardTask[]) => setTasks(withCompletion(columns, next)),
    [columns],
  );

  const handleDragStart = useCallback(() => setIsDragging(true), []);
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const overId = event.over?.id;
      if (overId === undefined) {
        setOverColumnId(null);
        return;
      }
      const key = String(overId);
      const overTask = tasks.find((task) => task.id === key);
      if (overTask) {
        setOverColumnId(overTask.column);
        return;
      }
      setOverColumnId(columns.some((column) => column.id === key) ? key : null);
    },
    [columns, tasks],
  );
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setOverColumnId(null);
  }, []);

  const handleCreateTask = useCallback(
    async (title: string, columnId?: string) => {
      const target = columnId ?? columns[0]?.id;
      if (target === undefined) return;
      const created = await createTask(projectId, { title, columnId: target });
      setTasks((current) => orderTasks(columns, [...current, toBoardTask(created)]));
    },
    [columns, projectId],
  );

  const handleSaveTask = useCallback(
    async (values: TaskValues) => {
      if (editingTask === null) {
        const created = await createTask(projectId, {
          title: values.title,
          description: values.description,
          dueDate: values.dueDate,
          columnId: values.columnId,
          priority: values.priority,
          goalId: values.goalId,
        });
        setTasks((current) => orderTasks(columns, [...current, toBoardTask(created)]));
        return;
      }

      const updated = await updateTask(editingTask.id, {
        title: values.title,
        description: values.description,
        dueDate: values.dueDate,
        columnId: values.columnId,
        priority: values.priority,
        goalId: values.goalId,
      });
      setTasks((current) =>
        withCompletion(
          columns,
          orderTasks(
            columns,
            current.map((task) =>
              task.id === updated.id
                ? {
                    ...task,
                    name: updated.title,
                    description: updated.description,
                    dueDate: updated.dueDate,
                    priority: updated.priority,
                    goalId: updated.goalId,
                    column: updated.columnId,
                  }
                : task,
            ),
          ),
        ),
      );
    },
    [columns, editingTask, projectId],
  );

  const handleDeleteTask = useCallback(
    async (task: BoardTask) => {
      await deleteTask(task.id);
      setTasks((current) => current.filter((candidate) => candidate.id !== task.id));
      setTaskDialogOpen(false);
      setUndo({ task });
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndo(null), 8000);
    },
    [],
  );

  const handleUndo = useCallback(async () => {
    if (undo === null) return;
    const { task } = undo;
    setUndo(null);
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    try {
      const restored = await createTask(projectId, {
        title: task.name,
        description: task.description,
        dueDate: task.dueDate,
        columnId: task.column,
        priority: task.priority,
        goalId: task.goalId,
      });
      setTasks((current) => orderTasks(columns, [...current, toBoardTask(restored)]));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "unknown_error");
    }
  }, [columns, projectId, undo]);

  const handleSaveColumn = useCallback(
    async (values: ColumnValues) => {
      if (editingColumn === null) {
        const created = await createColumn(projectId, values);
        setBoard((current) => (current === null ? current : { ...current, columns: [...current.columns, created] }));
        return;
      }
      const updated = await updateColumn(editingColumn.id, values);
      setBoard((current) =>
        current === null
          ? current
          : { ...current, columns: current.columns.map((column) => (column.id === updated.id ? updated : column)) },
      );
      setTasks((current) => withCompletion([...columns.filter((column) => column.id !== updated.id), updated], current));
    },
    [columns, editingColumn, projectId],
  );

  const handleDeleteColumn = useCallback(
    async (column: Column) => {
      await deleteColumn(column.id);
      await load();
      setColumnDialogOpen(false);
    },
    [load],
  );

  const moveColumn = useCallback(
    async (column: Column, offset: -1 | 1) => {
      if (board === null) return;
      const ordered = [...columns].sort((left, right) => left.position - right.position);
      const index = ordered.findIndex((entry) => entry.id === column.id);
      const neighbour = ordered[index + offset];
      if (neighbour === undefined) return;

      const next = [...ordered];
      next[index] = neighbour;
      next[index + offset] = column;
      try {
        const result = await saveLayout(projectId, {
          columns: next.map((entry) => entry.id),
          tasks: tasks.map((task) => ({ id: task.id, columnId: task.column })),
        });
        const reordered = { project: board.project, columns: result.columns, tasks: result.tasks };
        setBoard(reordered);
        setTasks(toBoardTasks(reordered));
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "unknown_error");
      }
    },
    [board, columns, projectId, tasks],
  );

  const filtering =
    search.trim() !== "" || priorityFilter !== "all" || goalFilter !== "all" || overdueOnly;

  const matches = useCallback(
    (task: BoardTask): boolean => {
      const query = search.trim().toLowerCase();
      if (query !== "" && !task.name.toLowerCase().includes(query)) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (goalFilter !== "all" && task.goalId !== goalFilter) return false;
      if (overdueOnly && !(task.dueDate !== null && isOverdue(task.dueDate, task.isCompleted))) return false;
      return true;
    },
    [goalFilter, overdueOnly, priorityFilter, search],
  );

  const visibleTasks = useMemo(() => tasks.filter(matches), [matches, tasks]);

  const doneCount = tasks.filter((task) => task.isCompleted).length;
  const progress = tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100);
  const overdueCount = tasks.filter((task) => task.dueDate !== null && isOverdue(task.dueDate, task.isCompleted)).length;

  if (loading) {
    return (
      <div className={boardFrameClassName}>
        <LoadingSkeleton label={t("projects.loadingBoard")} />
      </div>
    );
  }

  if (board === null) {
    return (
      <div className={boardFrameClassName}>
        <header className="flex shrink-0 flex-col pb-5">
          <Link to="/projects" aria-label={t("projects.back")} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            <ArrowLeft size={12} aria-hidden="true" />
            {t("projects.projects")}
          </Link>
          <h1 className="mt-0.5 text-[20px] leading-tight font-semibold tracking-tight text-foreground">{t("projects.boardTitle")}</h1>
        </header>
        <p role="alert" className="text-[13px] text-destructive">
          {error ?? t("projects.boardLoadError")}
        </p>
      </div>
    );
  }

  return (
    <div className={boardFrameClassName}>
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border/70 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Link
              to="/projects"
              aria-label={t("projects.back")}
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={12} aria-hidden="true" />
              {t("projects.projects")}
            </Link>
            <span className="text-[12px] text-muted-foreground" aria-hidden="true">/</span>
            <span className="text-[12px] text-muted-foreground">{board.project.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[20px] leading-tight font-semibold tracking-tight text-foreground">{board.project.name}</h1>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {t("projects.progressSummary", { done: doneCount, total: tasks.length })}
            </span>
            {overdueCount > 0 ? (
              <span className="text-[12px] tabular-nums text-destructive">{t("projects.overdue", { count: overdueCount })}</span>
            ) : null}
          </div>
          {board.project.description === null || board.project.description.trim() === "" ? null : (
            <p className="mt-1 max-w-[680px] text-[12px] leading-5 text-muted-foreground">{board.project.description}</p>
          )}
          <div
            role="progressbar"
            aria-label={t("projects.projectProgress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="mt-2 h-0.5 w-[140px] overflow-hidden rounded-full bg-border"
          >
            <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("projects.view")} className="inline-flex items-center gap-0.5">
            {([["board", t("projects.viewBoard")], ["calendar", t("projects.viewCalendar")]] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={cn(
                  "h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none",
                  view === value && "bg-muted text-foreground",
                )}
              >
                {value === "board" ? <LayoutGrid size={12} className="mr-1" aria-hidden="true" /> : <CalendarDays size={12} className="mr-1" aria-hidden="true" />}
                {label}
              </Button>
            ))}
          </div>

          <Button variant="outline" onClick={() => { setEditingColumn(null); setColumnDialogOpen(true); }} className="h-8 gap-1.5 px-2.5 text-xs">
            <Plus size={13} aria-hidden="true" />
            {t("projects.columnAdded")}
          </Button>
          <Button onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }} className="h-8 gap-1.5 px-2.5 text-xs">
            <Plus size={13} aria-hidden="true" />
            {t("projects.taskAdded")}
          </Button>
          <div className="[&>button]:size-8">
            <ThemeToggle />
          </div>
          <LanguageToggle />
        </div>
      </header>

      {error === null ? null : (
        <p role="alert" className="mt-3 border-l-2 border-destructive py-1 pl-3 text-[12px] text-destructive">
          {error}
        </p>
      )}

      {view === "calendar" ? (
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          <TasksCalendar
            projectId={projectId}
            onOpenTask={(calendarTask) => {
              const match = tasks.find((task) => task.id === calendarTask.id);
              if (match !== undefined) {
                setEditingTask(match);
                setTaskDialogOpen(true);
              }
            }}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 py-3">
            <div className="relative min-w-[10rem] flex-1 sm:max-w-[16rem]">
              <Search size={12} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label={t("projects.searchTasks")}
                placeholder={t("projects.searchTasksPlaceholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 border-border/70 pl-7 text-xs"
              />
            </div>

            <Select value={priorityFilter} onValueChange={(value) => value && setPriorityFilter(value as ProjectPriority | "all")}>
              <SelectTrigger aria-label={t("projects.priority")} className="h-8 gap-1 border-border/70 px-2 text-xs text-muted-foreground">
                <SelectValue>{(value: string) => (value === "all" ? t("projects.anyPriority") : t(`tasks.priority.${value}`))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="min-h-9 text-sm">{t("projects.anyPriority")}</SelectItem>
                {(Object.keys(priorityStyles) as ProjectPriority[]).map((value) => (
                  <SelectItem key={value} value={value} className="min-h-9 text-sm">
                    {priorityStyles[value].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {goalNames.length > 0 ? (
              <Select value={goalFilter} onValueChange={(value) => value && setGoalFilter(value)}>
                <SelectTrigger aria-label={t("goals.title")} className="h-8 gap-1 border-border/70 px-2 text-xs text-muted-foreground">
                  <SelectValue>{(value: string) => (value === "all" ? t("projects.anyGoal") : goalNames.find((goal) => goal.id === value)?.title ?? t("projects.anyGoal"))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="min-h-9 text-sm">{t("projects.anyGoal")}</SelectItem>
                  {goalNames.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id} className="min-h-9 text-sm">{goal.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              aria-pressed={overdueOnly}
              onClick={() => setOverdueOnly((current) => !current)}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none",
                overdueOnly && "bg-muted text-foreground",
              )}
            >
              {t("projects.overdueFilter")}
            </Button>

            {filtering ? (
              <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                {t("projects.shown", { shown: visibleTasks.length, total: tasks.length })}
              </span>
            ) : null}
          </div>

          {filtering ? (
            <div className="mt-4 grid min-h-0 flex-1 gap-6 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {[...columns]
                .sort((left, right) => left.position - right.position)
                .map((column) => {
                  const columnTasks = visibleTasks.filter((task) => task.column === column.id);
                  return (
                    <section key={column.id} aria-label={column.name} className="min-w-0">
                      <div className="flex items-baseline gap-2 border-b border-border pb-1.5">
                        <h3 className="truncate text-[13px] font-medium text-foreground">{column.name}</h3>
                        <span className="text-[11px] tabular-nums text-muted-foreground">{columnTasks.length}</span>
                      </div>
                      {columnTasks.length === 0 ? (
                        <p className="py-2 text-[11px] text-muted-foreground">{t("projects.noMatchingTasks")}</p>
                      ) : (
                        <ul className="divide-y divide-border/60">
                          {columnTasks.map((task) => (
                            <li key={task.id}>
                              <button
                                type="button"
                                onClick={() => { setEditingTask(task); setTaskDialogOpen(true); }}
                                className="flex min-h-9 w-full items-center gap-2 py-1 text-left text-[13px] text-foreground hover:bg-muted/40"
                              >
                                <span className={cn("size-1.5 shrink-0 rounded-full", priorityStyles[task.priority].dot)} aria-hidden="true" />
                                <span className={cn("truncate", task.isCompleted && "text-muted-foreground line-through")}>{task.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
            </div>
          ) : (
            <div className="mt-4 min-h-0 flex-1 overflow-x-auto">
              <div className="flex min-h-full flex-col gap-6 lg:flex-row lg:items-stretch">
                <KanbanProvider<BoardTask, Column>
                  columns={columns}
                  data={tasks}
                  onDataChange={handleDataChange}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  className="flex min-h-0 w-full flex-col gap-6 lg:flex-row lg:items-stretch"
                >
                  {(column) => (
                    <div key={column.id} className="min-w-0 w-full lg:w-[300px] lg:shrink-0">
                      <BoardColumn
                        column={column}
                        tasks={tasks.filter((task) => task.column === column.id)}
                        isDropTarget={overColumnId === column.id}
                        canRemove={columns.length > 1}
                        goalNames={new Map(goalNames.map((goal) => [goal.id, goal.title]))}
                        onCreateTask={(title) => handleCreateTask(title, column.id)}
                        onOpenTask={(task) => { setEditingTask(task); setTaskDialogOpen(true); }}
                        onRenameColumn={(next) => { setEditingColumn(next); setColumnDialogOpen(true); }}
                        onMoveColumn={(next, offset) => void moveColumn(next, offset)}
                        onDeleteColumn={(next) => { setEditingColumn(next); setColumnDialogOpen(true); }}
                      />
                    </div>
                  )}
                </KanbanProvider>
              </div>
            </div>
          )}
        </>
      )}

      {undo === null ? null : (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs"
        >
          <span className="min-w-0 truncate text-muted-foreground">{t("projects.undoDeleted", { name: undo.task.name })}</span>
          <Button type="button" variant="ghost" onClick={() => void handleUndo()} className="h-7 shrink-0 px-2 text-xs">
            {t("projects.undo")}
          </Button>
        </div>
      )}

      <TaskDialog
        open={taskDialogOpen}
        task={editingTask}
        columns={columns}
        goals={goalNames}
        onOpenChange={(open) => { setTaskDialogOpen(open); if (!open) setEditingTask(null); }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />

      <ColumnDialog
        open={columnDialogOpen}
        column={editingColumn}
        onOpenChange={(open) => { setColumnDialogOpen(open); if (!open) setEditingColumn(null); }}
        onSave={handleSaveColumn}
        onDelete={editingColumn === null || columns.length <= 1 ? undefined : handleDeleteColumn}
      />
    </div>
  );
}
