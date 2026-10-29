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
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import type { ProjectSummary } from "./projects-api";
import { Field } from "./field";

export type ProjectValues = {
  name: string;
  description: string | null;
};

type ProjectDialogProps = {
  open: boolean;
  /** `null` opens the dialog in create mode; a project opens it in edit mode with its data already loaded. */
  project: ProjectSummary | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: ProjectValues) => Promise<void>;
  onDelete?: (project: ProjectSummary) => void | Promise<void>;
};

/**
 * The editor for one project: its name and, optionally, what it is about.
 *
 * A project created here arrives on the server with the three columns of a fresh board, so nothing else
 * has to be asked of the person filling this in.
 */
export function ProjectDialog({ open, project, onOpenChange, onSave, onDelete }: ProjectDialogProps) {
  const { t } = useT();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dialog is the editor for one project, so it reloads the draft every time it opens.
  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setDescription(project?.description ?? "");
      setError(null);
    }
  }, [open, project]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      setError(t("projects.nameRequired"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave({ name: trimmed, description: description.trim() || null });
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
                <DialogTitle>{project === null ? t("projects.newProject") : t("projects.editProject")}</DialogTitle>
                <DialogDescription>
                  {project === null
                    ? t("projects.description")
                    : t("projects.descriptionEdit")}
                </DialogDescription>
              </div>
              <DialogCloseIcon aria-label={t("projects.cancelClose")} />
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              <Field label={t("projects.name")}  htmlFor="project-name">
                <Input
                  id="project-name"
                  aria-label={t("projects.name")}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("projects.namePlaceholder")}
                  autoFocus
                />
              </Field>

              <Field label={t("projects.descriptionLabel")}  htmlFor="project-description">
                <Textarea
                  id="project-description"
                  aria-label={t("projects.descriptionLabel")}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("projects.descriptionPlaceholder")}
                  rows={3}
                />
              </Field>

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
              {project !== null && onDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={busy}
                  onClick={() => void onDelete(project)}
                >
                  {t("projects.delete")}
                </Button>
              ) : null}
              <DialogClose render={<Button type="button" variant="ghost" />}>{t("projects.cancel")}</DialogClose>
              <Button type="submit" disabled={busy}>
                {project === null ? t("projects.createProject") : t("projects.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
