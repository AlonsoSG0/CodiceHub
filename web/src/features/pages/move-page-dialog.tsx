import { useMemo, useState } from "react";
import { ArrowUpToLine, Check, Layers } from "lucide-react";
import {
  Dialog,
  DialogBackdrop,
  DialogBody,
  DialogCloseIcon,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PageMeta, PageSection } from "@/lib/api";
import { PageIcon } from "./page-icon.js";
import { useT } from "@/i18n";

export type MoveDestination = { parentId: string | null; sectionId: string | null };

type MovePageDialogProps = {
  /** The page being moved, or null while the dialog is closed. */
  page: PageMeta | null;
  pages: PageMeta[];
  sections: PageSection[];
  onOpenChange: (open: boolean) => void;
  onMove: (destination: MoveDestination) => void;
};

type Destination = {
  key: string;
  title: string;
  trail: string;
  page: PageMeta | null;
  destination: MoveDestination;
};

/** A page can never be moved into itself or into its own subtree; the server rejects it too. */
export function invalidDestinations(pages: PageMeta[], pageId: string): Set<string> {
  const byParent = new Map<string, PageMeta[]>();
  for (const page of pages) {
    if (page.parentId === null) continue;
    const siblings = byParent.get(page.parentId) ?? [];
    siblings.push(page);
    byParent.set(page.parentId, siblings);
  }

  const blocked = new Set<string>([pageId]);
  const pending = [pageId];
  while (pending.length > 0) {
    const id = pending.shift()!;
    for (const child of byParent.get(id) ?? []) {
      if (blocked.has(child.id)) continue;
      blocked.add(child.id);
      pending.push(child.id);
    }
  }
  return blocked;
}

function trailOf(pages: PageMeta[], page: PageMeta, untitled: string): string {
  const byId = new Map(pages.map((candidate) => [candidate.id, candidate]));
  const titles: string[] = [];
  const seen = new Set<string>([page.id]);
  let parent = page.parentId === null ? undefined : byId.get(page.parentId);
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    titles.unshift(parent.title.trim() || untitled);
    parent = parent.parentId === null ? undefined : byId.get(parent.parentId);
  }
  return titles.join(" › ");
}

export function MovePageDialog({ page, pages, sections, onOpenChange, onMove }: MovePageDialogProps) {
  const { t, locale } = useT();
  const [query, setQuery] = useState("");

  const destinations = useMemo<Destination[]>(() => {
    if (!page) return [];
    const blocked = invalidDestinations(pages, page.id);

    const shelves: Destination[] = [
      { id: null, name: t("notes.pages") },
      ...sections.map(({ id, name }) => ({ id, name })),
    ].map((shelf) => ({
      key: `shelf:${shelf.id ?? "default"}`,
      title: shelf.name.trim() || t("notes.untitledShelf"),
      trail: t("notes.topLevel"),
      page: null,
      destination: { parentId: null, sectionId: shelf.id },
    }));

    const pagesBelow = pages
      .filter((candidate) => !blocked.has(candidate.id))
      .map<Destination>((candidate) => ({
        key: `page:${candidate.id}`,
        title: candidate.title.trim() || t("notes.untitled"),
        trail: trailOf(pages, candidate, t("notes.untitled")),
        page: candidate,
        destination: { parentId: candidate.id, sectionId: candidate.sectionId },
      }))
      .sort((left, right) => left.title.localeCompare(right.title, locale, { sensitivity: "base" }));

    const candidates = [...shelves, ...pagesBelow];
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? candidates.filter(
          (candidate) =>
            candidate.title.toLocaleLowerCase().includes(needle) ||
            candidate.trail.toLocaleLowerCase().includes(needle),
        )
      : candidates;
  }, [page, pages, query, sections, locale, t]);

  const currentSectionId = page?.sectionId ?? null;
  const currentParentId = page?.parentId ?? null;

  return (
    <Dialog open={page !== null} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <div className="grid gap-1">
              <DialogTitle>{t("notes.movePage")}</DialogTitle>
              <DialogDescription>
                {page ? t("notes.chooseNewPlace", { title: page.title.trim() || t("notes.untitled") }) : null}
              </DialogDescription>
            </div>
            <DialogCloseIcon aria-label={t("notes.closeMoveDialog")} className="size-11 md:size-7" />
          </DialogHeader>
          <DialogBody className="grid gap-3">
            <Input
              type="search"
              aria-label={t("notes.filterDestinations")}
              placeholder={t("notes.filterShelvesPages")}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              className="h-9"
            />
            <div role="listbox" aria-label={t("notes.destinations")} className="grid max-h-[45dvh] gap-0.5 overflow-y-auto">
              {destinations.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">{t("notes.noPagesMatch", { query: query.trim() })}</p>
              ) : (
                destinations.map((destination) => {
                  const selected =
                    destination.destination.parentId === currentParentId &&
                    destination.destination.sectionId === currentSectionId;
                  return (
                    <button
                      key={destination.key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onMove(destination.destination)}
                      className="flex min-h-10 items-center gap-2 rounded-[4px] px-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                    >
                      {destination.page ? (
                        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                          <PageIcon icon={destination.page.icon} className="size-4" />
                        </span>
                      ) : destination.destination.sectionId === null && destination.key === "shelf:default" ? (
                        <ArrowUpToLine size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                      ) : (
                        <Layers size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{destination.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{destination.trail}</span>
                      </span>
                      {selected ? <Check size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </DialogBody>
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            {t("notes.moveKeepsSubpages")}
          </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
