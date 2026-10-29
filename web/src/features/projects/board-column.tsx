import { type FormEvent, useEffect, useRef, useState } from "react";
import { Check, MoreHorizontal, MoveLeft, MoveRight, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { KanbanBoard, KanbanCard, KanbanCards, KanbanHeader } from "@/components/kibo-ui/kanban";
import { Button } from "@/components/ui/button";
import { MenuPopup, menuItemClassName } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import type { BoardTask, Column } from "./projects-api";
import { dueLabel, isOverdue } from "./due";
import { priorityStyles } from "@/components/priority-control";
import { useT } from "@/i18n";

type BoardColumnProps = {
  column: Column;
  tasks: BoardTask[];
  /** True while a card is being dragged over this column. */
  isDropTarget: boolean;
  canRemove: boolean;
  onCreateTask: (title: string) => Promise<void>;
  onOpenTask: (task: BoardTask) => void;
  /** Goal id → title, so a card can say what it serves without the board knowing goals. */
  goalNames: Map<string, string>;
  onRenameColumn: (column: Column) => void;
  onMoveColumn: (column: Column, offset: -1 | 1) => void;
  onDeleteColumn: (column: Column) => void;
};

/**
 * One column of the board.
 *
 * At rest, the column is only its heading, cards and composer on the board ground. The full-height
 * drop zone stays visually quiet until a card is carried over it.
 */
export function BoardColumn({
  column,
  tasks,
  isDropTarget,
  canRemove,
  onCreateTask,
  onOpenTask,
  goalNames,
  onRenameColumn,
  onMoveColumn,
  onDeleteColumn,
}: BoardColumnProps) {
  const { locale, t } = useT();
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <KanbanBoard
        id={column.id}
        className={cn(
          "flex h-full min-h-0 w-full flex-col divide-y-0 overflow-visible rounded-none border-0 bg-transparent text-[13px] text-foreground shadow-none ring-0 transition-colors duration-150",
          "[&>[data-slot=scroll-area]]:h-auto [&>[data-slot=scroll-area]]:max-h-[calc(100dvh-19rem)] [&>[data-slot=scroll-area]]:flex-none",
          isDropTarget && "rounded-[8px] bg-accent/50",
        )}
      >
        <KanbanHeader className="flex min-w-0 items-center gap-2 px-0 py-2">
          {column.isCompleted ? (
            <Check size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          ) : null}
          <h3 className="min-w-0 truncate text-[14px] leading-5 font-semibold text-foreground">{column.name}</h3>
          <span className="shrink-0 text-[13px] leading-5 text-muted-foreground tabular-nums">{tasks.length}</span>
          <span className="flex-1" />

          <BaseMenu.Root>
            <BaseMenu.Trigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${column.name} actions`}
                  className="size-11 rounded-[6px] text-muted-foreground hover:text-foreground sm:size-8"
                  onPointerDown={(event) => event.stopPropagation()}
                />
              }
            >
              <MoreHorizontal size={14} aria-hidden="true" />
            </BaseMenu.Trigger>
            <MenuPopup align="end">
              <BaseMenu.Item className={menuItemClassName} onClick={() => onRenameColumn(column)}>
                <Pencil size={14} aria-hidden="true" />
                Rename…
              </BaseMenu.Item>
              <BaseMenu.Item
                className={menuItemClassName}
                disabled={column.position === 0}
                onClick={() => onMoveColumn(column, -1)}
              >
                <MoveLeft size={14} aria-hidden="true" />
                Move left
              </BaseMenu.Item>
              <BaseMenu.Item
                className={menuItemClassName}
                disabled={!canRemove}
                onClick={() => onMoveColumn(column, 1)}
              >
                <MoveRight size={14} aria-hidden="true" />
                Move right
              </BaseMenu.Item>
              <div role="separator" className="my-1 h-px bg-border" />
              <BaseMenu.Item
                className={cn(menuItemClassName, "text-destructive")}
                disabled={!canRemove}
                onClick={() => onDeleteColumn(column)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </BaseMenu.Item>
            </MenuPopup>
          </BaseMenu.Root>
        </KanbanHeader>

        <KanbanCards<BoardTask> id={column.id} className="flex-grow-0 gap-2 p-0 pt-1">
          {(card) => (
            <KanbanCard
              key={card.id}
              id={card.id}
              name={card.name}
              column={card.column}
              className="gap-2 rounded-lg border border-border/70 bg-card p-3 text-[13px] shadow-none ring-0 ring-transparent transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-foreground/25 [&.cursor-grabbing]:ring-1 [&.cursor-grabbing]:ring-primary/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <TaskCardContent task={card} goalNames={goalNames} locale={locale} t={t} onOpen={() => onOpenTask(card)} />
            </KanbanCard>
          )}
        </KanbanCards>

        {tasks.length === 0 ? (
          <p className="px-0 py-2 text-[13px] leading-5 text-muted-foreground">{t("projects.noTasksColumn")}</p>
        ) : null}

        <div className="pt-2">
          <TaskComposer onCreate={onCreateTask} t={t} />
        </div>
      </KanbanBoard>
    </div>
  );
}

/** The body of a card: its title, a line of notes, and the day it is due. */
function TaskCardContent({
  task,
  goalNames,
  locale,
  t,
  onOpen,
}: {
  task: BoardTask;
  goalNames: Map<string, string>;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  onOpen: () => void;
}) {
  const overdue = task.dueDate !== null && isOverdue(task.dueDate, task.isCompleted);
  const priority = priorityStyles[task.priority];
  const goalName = task.goalId === null ? null : goalNames.get(task.goalId) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        {task.isCompleted ? (
          <Check size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
        ) : null}
        <p
          className={cn(
            "min-w-0 text-[14px] leading-[1.4] font-medium text-card-foreground",
            task.isCompleted && "text-muted-foreground line-through decoration-2 decoration-muted-foreground",
          )}
        >
          {task.name}
        </p>
      </div>

      {task.description === null || task.description.trim() === "" ? null : (
        <p className="line-clamp-2 text-[13px] leading-[1.45] text-muted-foreground">{task.description}</p>
      )}

      <div className="flex items-center gap-2">
        {task.priority === "none" ? null : (
          <span className={cn("inline-flex shrink-0 items-center gap-1 text-[10px]", priority.text)}>
            <span className={cn("size-1.5 rounded-full", priority.dot)} aria-hidden="true" />
            {priority.label}
          </span>
        )}
        {goalName === null ? null : (
          <span className="inline-flex min-w-0 items-center gap-0.5 text-[10px] text-muted-foreground">
            <Target size={10} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{goalName}</span>
          </span>
        )}
        <span className="flex-1" />
        {task.dueDate === null ? null : (
          <span
            className={cn(
              "shrink-0 text-[11px] leading-4 tabular-nums",
              overdue ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {dueLabel(task.dueDate, locale, { today: t("projects.today"), tomorrow: t("projects.tomorrow"), yesterday: t("projects.yesterday") })}
          </span>
        )}

        <button
          type="button"
          aria-label={t("projects.openTask", { name: task.name })}
          // The card is the drag handle; the sensor listens on the document, so the synthetic
          // stopPropagation alone never reached it and a press on this button started a drag.
          onPointerDown={(event) => {
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[opacity,color] duration-150 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none sm:opacity-0 sm:group-hover/card:opacity-100"
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * The composer at the foot of a column.
 *
 * It stays out of the way until it is needed, and it stays open after a task is written: a column of
 * tasks is usually written in one go, and a click between every one of them is a click too many.
 */
function TaskComposer({ onCreate, t }: { onCreate: (title: string) => Promise<void>; t: (key: string) => string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center gap-1.5 rounded-[6px] px-2 text-left text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9"
      >
        <Plus size={13} aria-hidden="true" />
        {t("projects.addTask")}
      </button>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === "") {
      setOpen(false);
      return;
    }

    setBusy(true);
    try {
      await onCreate(trimmed);
      setTitle("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <input
        ref={inputRef}
        aria-label={t("projects.taskTitle")}
        value={title}
        disabled={busy}
        placeholder={t("projects.taskTitlePlaceholder")}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setTitle("");
          }
        }}
        className="h-11 w-full rounded-[6px] border border-input bg-background px-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9"
      />
    </form>
  );
}
