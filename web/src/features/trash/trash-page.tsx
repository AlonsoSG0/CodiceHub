import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWorkspaceOutletContext } from "@/components/layout/workspace-outlet-context";
import type { PageMeta } from "@/lib/api";
import { fetchTrash, purgeTrashPage, restoreTrashPage } from "./trash-api.js";
import { useT } from "@/i18n";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

function getPageTitle(page: PageMeta, untitled: string): string {
  return page.title || untitled;
}

function formatDeletedAt(value: string | null, locale: string, unavailable: string): string {
  if (!value) return unavailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unavailable;
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function TrashPage() {
  const { t, locale } = useT();
  const { pages: livePages = [], refreshTree = async () => undefined } = useWorkspaceOutletContext();
  const [trash, setTrash] = useState<PageMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyPageId, setBusyPageId] = useState<string | null>(null);
  const [confirmingPage, setConfirmingPage] = useState<PageMeta | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setTrash(await fetchTrash());
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!confirmingPage || !dialog) return;

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    cancelButtonRef.current?.focus();

    return () => {
      if (!dialog.open) return;
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
  }, [confirmingPage]);

  const pagesById = useMemo(
    () => new Map([...livePages, ...trash].map((page) => [page.id, page])),
    [livePages, trash],
  );

  const handleRestore = async (page: PageMeta) => {
    setActionError(null);
    setBusyPageId(page.id);
    try {
      await restoreTrashPage(page.id);
      await Promise.all([loadTrash(), refreshTree()]);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyPageId(null);
    }
  };

  const handlePurge = async () => {
    if (!confirmingPage) return;
    const page = confirmingPage;
    setActionError(null);
    setBusyPageId(page.id);
    try {
      await purgeTrashPage(page.id);
      setConfirmingPage(null);
      await loadTrash();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyPageId(null);
    }
  };

  return (
    <section className="page-column" aria-labelledby="trash-heading">
      <h1 id="trash-heading" className="page-title">{t("trash.heading")}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {t("trash.description")}
      </p>

      {loadError ? (
        <div role="alert" className="mb-5 grid gap-2 text-sm text-destructive">
          <p>{t("trash.loadError", { error: loadError })}</p>
          <Button type="button" variant="outline" onClick={() => void loadTrash()}>
            {t("trash.retry")}
          </Button>
        </div>
      ) : null}
      {actionError && !confirmingPage ? (
        <p role="alert" className="mb-5 text-sm text-destructive">
          {t("trash.actionError", { error: actionError })}
        </p>
      ) : null}

      {loading && !loadError ? <p role="status">{t("trash.loading")}</p> : null}
      {!loading && !loadError && trash.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("trash.empty")}</p>
      ) : null}
      {!loading && !loadError && trash.length > 0 ? (
        <ul aria-label={t("trash.deletedPages")} className="m-0 list-none p-0">
          {trash.map((page) => {
            const title = getPageTitle(page, t("notes.untitled"));
            const parent = page.parentId ? pagesById.get(page.parentId) : undefined;
            const location = parent
              ? t("trash.originallyUnder", { title: getPageTitle(parent, t("notes.untitled")) })
              : page.parentId
                ? t("trash.originalParent", { id: page.parentId })
                : t("trash.workspaceRoot");

            return (
              <li
                key={page.id}
                aria-label={t("trash.deletedPage", { title })}
                className="flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 break-words text-base font-medium">{title}</h2>
                    <span role="status" className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t("trash.deleted")}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-sm text-muted-foreground">{location}</p>
                  <p className="m-0 text-sm text-muted-foreground">
                    {t("trash.deletedAt")} <time dateTime={page.deletedAt ?? undefined}>{formatDeletedAt(page.deletedAt, locale, t("trash.deletionDateUnavailable"))}</time>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 sm:min-h-9"
                    disabled={busyPageId === page.id}
                    onClick={() => void handleRestore(page)}
                  >
                    {t("trash.restore")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-11 sm:min-h-9"
                    disabled={busyPageId === page.id}
                    onClick={() => {
                      setActionError(null);
                      setConfirmingPage(page);
                    }}
                  >
                    {t("trash.deletePermanently")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {confirmingPage ? (
        <dialog
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="purge-dialog-title"
          aria-describedby="purge-dialog-description"
          onCancel={(event) => {
            event.preventDefault();
            setConfirmingPage(null);
          }}
          className="fixed inset-0 m-auto w-[min(100%-2rem,28rem)] rounded-md border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
        >
          <div className="grid gap-4 p-6">
            <div className="grid gap-2">
              <h2 id="purge-dialog-title" className="m-0 text-lg font-semibold">
                {t("trash.confirmTitle", { title: getPageTitle(confirmingPage, t("notes.untitled")) })}
              </h2>
              <p id="purge-dialog-description" className="m-0 text-sm text-muted-foreground">
                {t("trash.confirmDescription", { title: getPageTitle(confirmingPage, t("notes.untitled")) })}
              </p>
            </div>
            {actionError ? (
              <p role="alert" className="m-0 text-sm text-destructive">
                {t("trash.actionError", { error: actionError })}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                ref={cancelButtonRef}
                type="button"
                variant="outline"
                className="min-h-11 sm:min-h-9"
                disabled={busyPageId === confirmingPage.id}
                onClick={() => setConfirmingPage(null)}
              >
                {t("trash.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11 sm:min-h-9"
                disabled={busyPageId === confirmingPage.id}
                onClick={() => void handlePurge()}
              >
                {t("trash.deletePermanently")}
              </Button>
            </div>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
