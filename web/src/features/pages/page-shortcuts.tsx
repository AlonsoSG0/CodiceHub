import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageMeta } from "@/lib/api";
import { PageIcon } from "./page-icon.js";
import { pageRowActionClass, pageRowClass, pageRowStyle } from "./page-row.js";
import { SidebarGroupHeading } from "./sidebar-group.js";
import { usePreference } from "@/features/settings/preferences";
import { useT } from "@/i18n";

const RECENT_LIMIT = 5;
/** Below this the tree is short enough to scan, and a recent list would only repeat it. */
const RECENT_THRESHOLD = 8;

function titleOf(page: PageMeta, untitled = "Untitled"): string {
  return page.title.trim() || untitled;
}

export function favouritePages(pages: PageMeta[]): PageMeta[] {
  return pages
    .filter((page) => page.favorite)
    .sort((left, right) => titleOf(left).localeCompare(titleOf(right), undefined, { sensitivity: "base" }));
}

export function recentPages(pages: PageMeta[]): PageMeta[] {
  if (pages.length <= RECENT_THRESHOLD) return [];
  return [...pages]
    .filter((page) => !page.favorite)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, RECENT_LIMIT);
}

type PageShortcutsProps = {
  pages: PageMeta[];
  activeId: string | null;
  onToggleFavorite: (pageId: string, favorite: boolean) => void;
};

/**
 * The two shelves above the tree: what you pinned and what you touched last. Both read the same rows as the
 * tree, so a page keeps one identity wherever it appears.
 */
export function PageShortcuts({ pages, activeId, onToggleFavorite }: PageShortcutsProps) {
  const { t } = useT();
  const [showRecent] = usePreference("notes.recent");
  const favourites = useMemo(() => favouritePages(pages), [pages]);
  const recent = useMemo(() => recentPages(pages), [pages]);

  return (
    <>
      {favourites.length > 0 ? (
        <div className="sidebar-group">
          <SidebarGroupHeading label={t("notes.favourites")} />
          <div role="list" aria-label={t("notes.favourites")} className="grid gap-0.5">
            {favourites.map((page) => (
              <div key={page.id} role="listitem" className={pageRowClass} style={pageRowStyle(1, activeId === page.id)}>
                <span aria-hidden="true" className="w-[18px] shrink-0" />
                <Link to={`/notes/${page.id}`} className="flex min-w-0 flex-1 items-center gap-1 py-1">
                  <span aria-hidden="true" className="shrink-0 text-muted-foreground"><PageIcon icon={page.icon} className="size-4" /></span>
                  <span className="truncate">{titleOf(page, t("notes.untitled"))}</span>
                </Link>
                <button
                  type="button"
                  aria-label={t("notes.removeNamedFavorite", { title: titleOf(page, t("notes.untitled")) })}
                  title={t("notes.removeFavorite")}
                  onClick={() => onToggleFavorite(page.id, false)}
                  className={cn(
                    pageRowActionClass,
                    "opacity-100 md:opacity-0 md:group-hover/page-row:opacity-100 md:group-focus-within/page-row:opacity-100",
                  )}
                >
                  <Star size={12} aria-hidden="true" fill="currentColor" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showRecent && recent.length > 0 ? (
        <div className="sidebar-group">
          <SidebarGroupHeading label={t("notes.recent")} />
          <div role="list" aria-label={t("notes.recent")} className="grid gap-0.5">
            {recent.map((page) => (
              <div key={page.id} role="listitem" className={pageRowClass} style={pageRowStyle(1, activeId === page.id)}>
                <span aria-hidden="true" className="w-[18px] shrink-0" />
                <Link to={`/notes/${page.id}`} className="flex min-w-0 flex-1 items-center gap-1 py-1">
                  <span aria-hidden="true" className="shrink-0 text-muted-foreground"><PageIcon icon={page.icon} className="size-4" /></span>
                  <span className="truncate">{titleOf(page, t("notes.untitled"))}</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
