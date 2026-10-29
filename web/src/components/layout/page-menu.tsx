import { useState } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { useNavigate } from "react-router-dom";
import { Download, Files, FolderInput, Link2, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { DocumentStats } from "@/components/editor/extras";
import { Button } from "@/components/ui/button";
import { MenuPopup, menuItemClassName } from "@/components/ui/menu";
import { useActiveEditor } from "@/features/editor/editor-bridge";
import { MovePageDialog } from "@/features/pages/move-page-dialog";
import type { MoveDestination } from "@/features/pages/move-page-dialog";
import { copyPageLink } from "@/features/pages/page-link";
import { duplicatePage } from "@/lib/api";
import { movePage } from "@/features/pages/move";
import type { PageMeta, PageSection } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

type PageMenuProps = {
  pageId: string | null;
  pages: PageMeta[];
  sections?: PageSection[];
  onRefreshTree?: () => void | Promise<void>;
  onToggleFavorite?: (pageId: string, favorite: boolean) => void;
  onTrashPage?: (pageId: string) => void | Promise<void>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

function editedAt(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The actions of the page you are looking at. It renders nothing when there is no page: a menu of dead items is
 * the same chrome the toolbar dropped with the Undo/Redo fix.
 */
export function PageMenu({ pageId, pages, sections = [], onRefreshTree, onToggleFavorite, onTrashPage }: PageMenuProps) {
  const { t, locale } = useT();
  const editor = useActiveEditor();
  const navigate = useNavigate();
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const page = pageId === null ? null : pages.find((candidate) => candidate.id === pageId) ?? null;
  if (!page) return null;

  const handleDuplicate = async () => {
    setBusy(true);
    setError(null);
    try {
      const copy = await duplicatePage(page.id);
      await onRefreshTree?.();
      navigate(`/notes/${copy.id}`);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (destination: MoveDestination) => {
    setMoveOpen(false);
    const { parentId, sectionId } = destination;
    const position =
      parentId === null
        ? pages.filter(
            (candidate) =>
              candidate.parentId === null &&
              (candidate.sectionId ?? null) === sectionId &&
              candidate.id !== page.id,
          ).length
        : pages.filter((candidate) => candidate.parentId === parentId && candidate.id !== page.id).length;
    try {
      await movePage(page.id, { parentId, position, ...(parentId === null ? { sectionId } : {}) });
      await onRefreshTree?.();
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  return (
    <div className="relative flex items-center">
      <BaseMenu.Root
        onOpenChange={(open) => {
          if (open) setError(null);
        }}
      >
        <BaseMenu.Trigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("notes.pageActions")} />}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </BaseMenu.Trigger>
        <MenuPopup align="end">
          <div className="grid gap-0.5 px-2 py-1 text-xs text-muted-foreground">
            {editor ? <DocumentStats editor={editor} /> : null}
            <span className="block">{t("notes.edited", { date: editedAt(page.updatedAt, locale) })}</span>
          </div>
          <div role="separator" className="my-1 h-px bg-border" />
          <BaseMenu.LinkItem
            className={menuItemClassName}
            href={`/api/pages/${encodeURIComponent(page.id)}/export.md`}
            download
          >
            <Download size={14} aria-hidden="true" />
            {t("notes.exportMarkdown")}
          </BaseMenu.LinkItem>
          <BaseMenu.Item
            className={menuItemClassName}
            closeOnClick={false}
            disabled={busy}
            onClick={() => void handleDuplicate()}
          >
            <Files size={14} aria-hidden="true" />
            {busy ? t("notes.duplicating") : t("notes.duplicate")}
          </BaseMenu.Item>
          <BaseMenu.Item className={menuItemClassName} onClick={() => onToggleFavorite?.(page.id, !page.favorite)}>
            <Star size={14} aria-hidden="true" fill={page.favorite ? "currentColor" : "none"} />
            {page.favorite ? t("notes.removeFavorite") : t("notes.addFavorite")}
          </BaseMenu.Item>
          <BaseMenu.Item className={menuItemClassName} onClick={() => setMoveOpen(true)}>
            <FolderInput size={14} aria-hidden="true" />
            {t("notes.moveTo")}
          </BaseMenu.Item>
          <BaseMenu.Item className={menuItemClassName} onClick={() => void copyPageLink(page.id)}>
            <Link2 size={14} aria-hidden="true" />
            {t("notes.copyLink")}
          </BaseMenu.Item>
          <div role="separator" className="my-1 h-px bg-border" />
          <BaseMenu.Item
            className={cn(menuItemClassName, "text-destructive")}
            onClick={() => void onTrashPage?.(page.id)}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t("notes.moveToTrash")}
          </BaseMenu.Item>
        </MenuPopup>
      </BaseMenu.Root>

      {error ? (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-popover px-2 py-1 text-xs text-destructive shadow-md"
        >
          {error}
        </p>
      ) : null}

      <MovePageDialog
        key={moveOpen ? page.id : "closed"}
        page={moveOpen ? page : null}
        pages={pages}
        sections={sections}
        onOpenChange={(open) => setMoveOpen(open)}
        onMove={(destination) => void handleMove(destination)}
      />
    </div>
  );
}
