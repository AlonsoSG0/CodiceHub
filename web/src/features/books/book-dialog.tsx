import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { uploadImage } from "@/lib/api";
import { ImageUp } from "lucide-react";
import type { Book, BookStatus } from "./books-api";

const statusKeys: Record<BookStatus, string> = {
  reading: "books.reading",
  completed: "books.completed",
  wishlist: "books.wishlist",
  abandoned: "books.abandoned",
};

const inputClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 motion-reduce:transition-none";

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

type BookDialogProps = {
  open: boolean;
  /** `null` opens the dialog in create mode; a book opens it in edit mode with its data already loaded. */
  book: Book | null;
  onOpenChange: (open: boolean) => void;
  onSave: (book: Book | null) => Promise<void>;
  onDelete?: (book: Book) => Promise<void>;
};

type Draft = {
  title: string;
  author: string;
  status: BookStatus;
  score: string;
  startDate: string;
  completedDate: string;
  link: string;
  expectation: string;
  coverUrl: string;
};

const emptyDraft: Draft = {
  title: "",
  author: "",
  status: "reading",
  score: "",
  startDate: "",
  completedDate: "",
  link: "",
  expectation: "",
  coverUrl: "",
};

function draftFrom(book: Book | null): Draft {
  if (book === null) return emptyDraft;
  return {
    title: book.title,
    author: book.author ?? "",
    status: book.status,
    score: book.score === null ? "" : String(book.score),
    startDate: book.startDate ?? "",
    completedDate: book.completedDate ?? "",
    link: book.link ?? "",
    expectation: book.expectation ?? "",
    coverUrl: book.coverUrl ?? "",
  };
}

export function BookDialog({ open, book, onOpenChange, onSave, onDelete }: BookDialogProps) {
  const { t, locale } = useT();
  const [draft, setDraft] = useState<Draft>(draftFrom(book));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The dialog is the editor for one book, so it reloads the draft every time it opens.
  useEffect(() => {
    if (open) {
      setDraft(draftFrom(book));
      setError(null);
      setConfirmingDelete(false);
    }
  }, [open, book]);

  const patch = (values: Partial<Draft>) => setDraft((current) => ({ ...current, ...values }));

  const handleCoverFile = async (file: File | undefined) => {
    if (file === undefined) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file);
      patch({ coverUrl: url });
    } catch {
      setError(t("books.operationError"));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (title === "") {
      setError(t("books.deleteTitleError"));
      return;
    }

    const score = draft.score.trim() === "" ? null : Number(draft.score);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 10)) {
      setError(t("books.scoreError"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave({
        id: book?.id ?? "",
        title,
        author: draft.author.trim() || null,
        status: draft.status,
        score,
        startDate: draft.startDate || null,
        completedDate: draft.completedDate || null,
        link: draft.link.trim() || null,
        expectation: draft.expectation.trim() || null,
        coverUrl: draft.coverUrl.trim() || null,
        createdAt: book?.createdAt ?? "",
        updatedAt: book?.updatedAt ?? "",
      });
      onOpenChange(false);
    } catch {
      setError(t("books.operationError"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (book === null || onDelete === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(book);
      onOpenChange(false);
    } catch {
      setError(t("books.operationError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmingDelete(false);
        onOpenChange(next);
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
          <form noValidate onSubmit={(event) => void handleSubmit(event)}>
            <DialogHeader>
              <div className="flex flex-col gap-1">
                <DialogTitle>{book === null ? t("books.add") : t("books.edit")}</DialogTitle>
                <DialogDescription>
                  {book === null
                    ? t("books.startTitleAuthor")
                    : t("books.lastEdited", { date: new Date(book.updatedAt).toLocaleString(locale) })}
                </DialogDescription>
              </div>
              <DialogCloseIcon aria-label={t("books.close")} className="size-9 [@media(hover:none)]:size-11" />
            </DialogHeader>

            <DialogBody className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
              <div className="space-y-4">
                <Field label={t("books.title")} htmlFor="book-title">
                  <Input
                    id="book-title"
                    aria-label={t("books.title")}
                    aria-required="true"
                    value={draft.title}
                    onChange={(event) => patch({ title: event.target.value })}
                    placeholder={t("books.titlePlaceholder")}
                    className={inputClassName}
                  />
                </Field>

                <Field label={t("books.author")} htmlFor="book-author">
                  <Input
                    id="book-author"
                    aria-label={t("books.author")}
                    value={draft.author}
                    onChange={(event) => patch({ author: event.target.value })}
                    placeholder={t("books.authorPlaceholder")}
                    className={inputClassName}
                  />
                </Field>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("books.cover")}</p>
                  <div className="flex min-w-0 gap-3 rounded-lg border border-border/70 p-3">
                    <div className="flex aspect-[3/4] w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted text-[10px] text-muted-foreground">
                      {draft.coverUrl.trim() === "" ? (
                        <span aria-hidden="true">{t("books.noCover")}</span>
                      ) : (
                        <img
                          src={draft.coverUrl}
                          alt={t("books.coverPreview", { title: draft.title || t("books.newBook") })}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <Field label={t("books.coverUrl")} htmlFor="book-cover">
                        <Input
                          id="book-cover"
                          type="url"
                          aria-label={t("books.coverUrl")}
                          value={draft.coverUrl}
                          onChange={(event) => patch({ coverUrl: event.target.value })}
                          placeholder={t("books.urlPlaceholder")}
                          className={inputClassName}
                        />
                      </Field>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className={cn(
                          "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-foreground transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
                          uploading && "pointer-events-none opacity-50",
                        )}>
                          <ImageUp className="size-4" aria-hidden="true" />
                          {uploading ? t("books.uploading") : t("books.uploadCover")}
                          <input
                            type="file"
                            aria-label={t("books.uploadImage")}
                            accept="image/png,image/jpeg,image/gif,image/webp"
                            className="sr-only"
                            disabled={uploading}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = "";
                              void handleCoverFile(file);
                            }}
                          />
                        </label>
                        {draft.coverUrl.trim() === "" ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => patch({ coverUrl: "" })}
                            className="h-9 px-2 text-sm"
                          >
                            {t("books.removeCover")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("books.status")}>
                    <Select
                      items={{
                        reading: t("books.reading"),
                        completed: t("books.completed"),
                        wishlist: t("books.wishlist"),
                        abandoned: t("books.abandoned"),
                      }}
                      value={draft.status}
                      onValueChange={(value) => value && patch({ status: value as BookStatus })}
                    >
                      <SelectTrigger aria-label={t("books.status")} className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(statusKeys) as BookStatus[]).map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(statusKeys[status])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label={t("books.score")} htmlFor="book-score">
                    <Input
                      id="book-score"
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      aria-label={t("books.score")}
                      value={draft.score}
                      onChange={(event) => patch({ score: event.target.value })}
                      placeholder="—"
                      className={cn(inputClassName, "tabular-nums")}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("books.started")} htmlFor="book-start">
                    <Input
                      id="book-start"
                      type="date"
                      aria-label={t("books.startDate")}
                      value={draft.startDate}
                      onChange={(event) => patch({ startDate: event.target.value })}
                      className={cn(inputClassName, "tabular-nums")}
                    />
                  </Field>

                  <Field label={t("books.completed")} htmlFor="book-completed">
                    <Input
                      id="book-completed"
                      type="date"
                      aria-label={t("books.completedDate")}
                      value={draft.completedDate}
                      onChange={(event) => patch({ completedDate: event.target.value })}
                      className={cn(inputClassName, "tabular-nums")}
                    />
                  </Field>
                </div>

                <Field label={t("books.link")} htmlFor="book-link">
                  <Input
                    id="book-link"
                    type="url"
                    aria-label={t("books.link")}
                    value={draft.link}
                    onChange={(event) => patch({ link: event.target.value })}
                    placeholder={t("books.urlPlaceholder")}
                    className={inputClassName}
                  />
                </Field>

                <Field label={t("books.expectation")} htmlFor="book-expectation">
                  <Textarea
                    id="book-expectation"
                    aria-label={t("books.expectation")}
                    value={draft.expectation}
                    onChange={(event) => patch({ expectation: event.target.value })}
                    placeholder={t("books.expectationPlaceholder")}
                    rows={3}
                    className="min-h-20 resize-y text-sm"
                  />
                </Field>
              </div>

              {error === null ? null : (
                <p role="alert" className="md:col-span-2 border-y border-destructive/30 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </DialogBody>

            {book !== null && onDelete ? (
              <section aria-label={t("books.deleteSection")} className="mx-5 border-t border-border pt-4">
                {!confirmingDelete ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{t("books.delete")}</h3>
                      <p className="text-xs text-muted-foreground">{t("books.deleteNotebookNote")}</p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setConfirmingDelete(true)}
                      className="h-9"
                    >
                      {t("books.delete")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p role="status" className="text-sm text-muted-foreground">{t("books.deleteNotebookNote")}</p>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmingDelete(false)} className="h-9">
                        {t("books.cancelDeletion")}
                      </Button>
                      <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()} className="h-9">
                        {t("books.confirmDelete")}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="ghost" className="h-9" />}>{t("books.cancel")}</DialogClose>
              <Button type="submit" disabled={busy || uploading} className="h-9">
                {book === null ? t("books.add") : t("books.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
