import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogBody,
  DialogClose,
  DialogCloseIcon,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { priorityOrder } from "@/components/priority-control";
import type { BoardTask, Column, ProjectPriority } from "./projects-api";
import { Field } from "./field";

export type TaskValues = {
  title: string;
  description: string | null;
  dueDate: string | null;
  columnId: string;
  priority: ProjectPriority;
  goalId: string | null;
};

type TaskDialogProps = {
  open: boolean;
  /** `null` opens the dialog in create mode; a task opens it in edit mode with its data already loaded. */
  task: BoardTask | null;
  columns: Column[];
  /** The goals this board can serve; the picker writes one id and nothing more. */
  goals: Array<{ id: string; title: string }>;
  onOpenChange: (open: boolean) => void;
  onSave: (values: TaskValues) => Promise<void>;
  onDelete?: (task: BoardTask) => Promise<void>;
};

/**
 * The editor for one task.
 *
 * The column selector is the keyboard route to the same place a drag goes: a card can always be moved
 * without a pointer, which is the one thing a drag-and-drop board usually forgets.
 */
export function TaskDialog({ open, task, columns, goals, onOpenChange, onSave, onDelete }: TaskDialogProps) {
  const { t } = useT();
  const [title, setTitle] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [columnId, setColumnId] = useState(task?.column ?? columns[0]?.id ?? "");
  const [priority, setPriority] = useState<ProjectPriority>(task?.priority ?? "none");
  const [goalId, setGoalId] = useState<string>(task?.goalId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnLabels = Object.fromEntries(columns.map((column) => [column.id, column.name]));

  // The dialog is the editor for one task, so it reloads the draft every time it opens.
  useEffect(() => {
    if (open) {
      setTitle(task?.name ?? "");
      setDescription(task?.description ?? "");
      setDueDate(task?.dueDate ?? "");
      setPriority(task?.priority ?? "none");
      setGoalId(task?.goalId ?? "");
      setColumnId(task?.column ?? columns[0]?.id ?? "");
      setError(null);
    }
  }, [open, task, columns]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === "") {
      setError(t("projects.taskTitleRequired"));
      return;
    }
    if (columnId === "") {
      setError(t("projects.taskColumnRequired"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave({
        title: trimmed,
        description: description.trim() || null,
        dueDate: dueDate || null,
        columnId,
        priority,
        goalId: goalId === "" ? null : goalId,
      });
      onOpenChange(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "unknown_error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup>
          <form onSubmit={(event) => void handleSubmit(event)}>
            <DialogHeader>
              <div className="flex flex-col gap-1">
                <DialogTitle>{task === null ? t("projects.taskTitleNew") : t("projects.taskTitleEdit")}</DialogTitle>
                <DialogDescription>
                  {task === null ? t("projects.taskNewDescription") : t("projects.taskEditDescription")}
                </DialogDescription>
              </div>
              <DialogCloseIcon aria-label={t("projects.cancelClose")} />
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              <Field label={t("projects.taskFieldTitle")}  htmlFor="task-title">
                <Input
                  id="task-title"
                  aria-label={t("projects.taskFieldTitle")}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("projects.taskTitlePlaceholderDialog")}
                  autoFocus
                />
              </Field>

              <Field label={t("projects.notes")}  htmlFor="task-notes">
                <Textarea
                  id="task-notes"
                  aria-label={t("projects.notes")}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("projects.notesPlaceholder")}
                  rows={3}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("projects.column")}>
                  <Select
                    items={columnLabels}
                    value={columnId}
                    onValueChange={(value) => value && setColumnId(value)}
                  >
                    <SelectTrigger aria-label={t("projects.column")} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((column) => (
                        <SelectItem key={column.id} value={column.id}>
                          {column.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label={t("projects.due")}  htmlFor="task-due">
                  <Input
                    id="task-due"
                    type="date"
                    aria-label={t("projects.taskDue")}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="tabular-nums"
                  />
                </Field>

                <Field label={t("projects.priority")}  htmlFor="task-priority">
                  <Select value={priority} onValueChange={(value) => value && setPriority(value as ProjectPriority)}>
                    <SelectTrigger id="task-priority" aria-label={t("projects.priority")} className="w-full">
                      <SelectValue>
                        {(value: string) => t(`tasks.priority.${(value as ProjectPriority) ?? "none"}`)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOrder.map((value) => (
                        <SelectItem key={value} value={value} className="min-h-9 text-sm">
                          {t(`tasks.priority.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label={t("goals.title")}  htmlFor="task-goal">
                  <Select value={goalId === "" ? "none" : goalId} onValueChange={(value) => value && setGoalId(value === "none" ? "" : value)}>
                    <SelectTrigger id="task-goal" aria-label={t("goals.title")} className="w-full">
                      <SelectValue>
                        {(value: string) => (value === "none" ? t("projects.noGoal") : goals.find((goal) => goal.id === value)?.title ?? t("projects.noGoal"))}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="min-h-9 text-sm">{t("projects.noGoal")}</SelectItem>
                      {goals.map((goal) => (
                        <SelectItem key={goal.id} value={goal.id} className="min-h-9 text-sm">
                          {goal.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {error === null ? null : (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
            </DialogBody>

            <DialogFooter>
              {task !== null && onDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={busy}
                  onClick={() => void onDelete(task)}
                >
                  {t("projects.delete")}
                </Button>
              ) : null}
              <DialogClose render={<Button type="button" variant="ghost" />}>{t("projects.cancel")}</DialogClose>
              <Button type="submit" disabled={busy}>
                {task === null ? t("projects.addTask") : t("projects.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
