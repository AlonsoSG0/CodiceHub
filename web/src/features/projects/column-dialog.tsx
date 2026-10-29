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
import type { Column } from "./projects-api";
import { Field } from "./field";
import { useT } from "@/i18n";

export type ColumnValues = {
  name: string;
  isCompleted: boolean;
};

type ColumnDialogProps = {
  open: boolean;
  /** `null` opens the dialog in create mode; a column opens it in edit mode with its data already loaded. */
  column: Column | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: ColumnValues) => Promise<void>;
  onDelete?: (column: Column) => Promise<void>;
};

/**
 * The editor for one column of a board.
 *
 * A column that "counts as done" is the only place a task is ever finished, so the switch lives next to
 * the name: the two facts about a column are decided in the same breath.
 */
export function ColumnDialog({ open, column, onOpenChange, onSave, onDelete }: ColumnDialogProps) {
  const { t } = useT();
  const [name, setName] = useState(column?.name ?? "");
  const [isCompleted, setIsCompleted] = useState(column?.isCompleted ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dialog is the editor for one column, so it reloads the draft every time it opens.
  useEffect(() => {
    if (open) {
      setName(column?.name ?? "");
      setIsCompleted(column?.isCompleted ?? false);
      setError(null);
    }
  }, [open, column]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      setError(t("projects.columnNameError"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave({ name: trimmed, isCompleted });
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
                <DialogTitle>{column === null ? t("projects.columnTitleNew") : t("projects.columnTitleEdit")}</DialogTitle>
                <DialogDescription>
                  {column === null
                    ? t("projects.columnNewDescription")
                    : t("projects.columnRenameDescription")}
                </DialogDescription>
              </div>
              <DialogCloseIcon aria-label={t("projects.cancelClose")} />
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              <Field label={t("projects.name")}  htmlFor="column-name">
                <Input
                  id="column-name"
                  aria-label={t("projects.name")}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("projects.columnPlaceholder")}
                  autoFocus
                />
              </Field>

              <label className="flex items-start gap-2.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={isCompleted}
                  onChange={(event) => setIsCompleted(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--foreground)]"
                />
                <span className="flex flex-col gap-0.5">
                  <span>{t("projects.columnCountDone")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("projects.columnDoneDescription")}
                  </span>
                </span>
              </label>

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
              {column !== null && onDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={busy}
                  onClick={() => void onDelete(column)}
                >
                  {t("projects.delete")}
                </Button>
              ) : null}
              <DialogClose render={<Button type="button" variant="ghost" />}>{t("projects.cancel")}</DialogClose>
              <Button type="submit" disabled={busy}>
                {column === null ? t("projects.addColumn") : t("projects.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
