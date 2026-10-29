import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspaceOutletContext } from "@/components/layout/workspace-outlet-context";
import type { PageMeta } from "@/lib/api";
import { PageIcon } from "./page-icon";
import { useT } from "@/i18n";

type PageRow = { page: PageMeta; path: string[]; subpages: number };

const dayInMs = 24 * 60 * 60 * 1000;

function pageTitle(page: PageMeta, untitled: string): string {
  return page.title.trim() || untitled;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** A short, readable stamp: the list is scanned, not read, so the newest rows speak in minutes. */
const defaultDateMessages: Record<string, string> = {
  "notes.noDate": "No date",
  "notes.justNow": "Just now",
  "notes.minutesAgo": "{count} min ago",
  "notes.hoursAgo": "{count} h ago",
  "notes.yesterday": "Yesterday",
  "notes.daysAgo": "{count} days ago",
};

export function formatUpdatedAt(
  value: string,
  now: Date,
  locale = "en-US",
  t: (key: string, values?: Record<string, string | number>) => string = (key, values) =>
    (defaultDateMessages[key] ?? key).replaceAll(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`)),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("notes.noDate");

  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return t("notes.justNow");
  if (minutes < 60) return t("notes.minutesAgo", { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24 && startOfDay(date) === startOfDay(now)) return t("notes.hoursAgo", { count: hours });

  const days = Math.round((startOfDay(now) - startOfDay(date)) / dayInMs);
  if (days === 1) return t("notes.yesterday");
  if (days > 1 && days < 7) return t("notes.daysAgo", { count: days });

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

function formatFullDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The flat index of the page tree. The sidebar shows where a page sits; this screen is the list you
 * scan when you know roughly what you wrote and not where you filed it, so every row carries its own
 * trail of ancestors and the row order is recency, never the tree's position.
 */
export function buildRows(pages: PageMeta[], untitled = "Untitled"): PageRow[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const subpages = new Map<string, number>();
  for (const page of pages) {
    if (page.parentId) subpages.set(page.parentId, (subpages.get(page.parentId) ?? 0) + 1);
  }

  const ancestorsOf = (page: PageMeta): string[] => {
    const titles: string[] = [];
    const seen = new Set<string>([page.id]);
    let parent = page.parentId ? byId.get(page.parentId) : undefined;
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      titles.unshift(pageTitle(parent, untitled));
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return titles;
  };

  return [...pages]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((page) => ({ page, path: ancestorsOf(page), subpages: subpages.get(page.id) ?? 0 }));
}

/** Deep trees are common; the last two ancestors are enough to place a page. */
export function trail(path: string[]): string {
  return path.length > 2 ? `… › ${path.slice(-2).join(" › ")}` : path.join(" › ");
}

const rowClass =
  "flex min-h-[48px] items-center gap-[12px] py-[10px] text-inherit no-underline transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";

export function NotesIndexPage() {
  const { t, locale } = useT();
  const {
    pages = [],
    refreshTree = async () => undefined,
    createPage = async () => undefined,
    treeLoading = false,
    treeError = null,
  } = useWorkspaceOutletContext();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const now = new Date();
  const rows = useMemo(() => buildRows(pages, t("notes.untitled")), [pages, t]);
  const todayStart = startOfDay(now);
  const editedToday = rows.filter(({ page }) => startOfDay(new Date(page.updatedAt)) === todayStart).length;

  const needle = query.trim().toLocaleLowerCase();
  const visible = needle
    ? rows.filter(
        ({ page, path }) =>
          pageTitle(page, t("notes.untitled")).toLocaleLowerCase().includes(needle) ||
          path.some((title) => title.toLocaleLowerCase().includes(needle)),
      )
    : rows;

  const summary =
    rows.length === 0
      ? null
      : `${t(rows.length === 1 ? "notes.pageCount" : "notes.pagesCount", { count: rows.length })}${editedToday > 0 ? t("notes.editedToday", { count: editedToday }) : ""}`;

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createPage(null);
    } finally {
      setCreating(false);
    }
  };

  return (
    <section aria-labelledby="notes-heading" className="mx-auto w-full max-w-[880px] px-[24px] pt-[40px] pb-[144px]">
      <header className="flex flex-wrap items-start justify-between gap-[16px]">
        <div className="grid gap-[4px]">
          <h1 id="notes-heading" className="text-[24px] font-semibold leading-[1.3] tracking-[-0.01em] text-foreground">
            {t("notes.notesHeading")}
          </h1>
          {summary ? <p className="text-[13px] leading-[1.5] text-muted-foreground">{summary}</p> : null}
        </div>
        <Button type="button" variant="outline" className="h-9 px-3" disabled={creating} onClick={() => void handleCreate()}>
          <Plus aria-hidden="true" />
          {t("notes.newPageButton")}
        </Button>
      </header>

      <section aria-labelledby="notes-library-heading" className="mt-[32px] border-t border-border">
        <div className="flex flex-col gap-[8px] py-[10px] sm:flex-row sm:items-center sm:justify-between">
          <h2 id="notes-library-heading" className="text-[13px] font-medium leading-[1.4] text-foreground">
            {t("notes.allPages")}
          </h2>
          {rows.length > 0 ? (
            <div className="flex flex-col gap-[8px] sm:flex-row sm:items-center sm:gap-[12px]">
              {needle ? (
                <span className="hidden text-[12px] tabular-nums text-muted-foreground sm:block">
                  {t("notes.visibleOfTotal", { visible: visible.length, total: rows.length })}
                </span>
              ) : null}
              <label className="relative flex items-center">
                <Search
                  className="pointer-events-none absolute left-[9px] size-[14px] text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  aria-label={t("notes.filterPages")}
                  placeholder={t("notes.filterPages")}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  className="h-[30px] w-full border-ring/35 pl-[28px] text-[13px] sm:w-[224px]"
                />
              </label>
            </div>
          ) : null}
        </div>

        {treeLoading ? (
          <div role="status" aria-label={t("notes.loadingPages")} className="grid">
            {[0, 1, 2, 3, 4].map((index) => (
              <div
                key={index}
                className="flex min-h-[48px] items-center gap-[12px] border-b border-border/70 py-[10px] last:border-b-0"
              >
                <span className="size-[16px] shrink-0 rounded-[3px] bg-muted" />
                <span className="h-[10px] w-[160px] rounded-[3px] bg-muted" />
                <span className="ml-auto h-[10px] w-[56px] rounded-[3px] bg-muted" />
              </div>
            ))}
          </div>
        ) : treeError ? (
          <div role="alert" className="grid gap-[12px] py-[16px] text-[13px]">
            <p>{t("notes.loadPagesError", { error: treeError })}</p>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => void refreshTree()}>
                {t("notes.retryPages")}
              </Button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <p className="my-[14px] rounded-[6px] border border-dashed border-border px-[16px] py-[24px] text-[13px] leading-[1.5] text-muted-foreground">
            {t("notes.createAndAppear")}
          </p>
        ) : visible.length === 0 ? (
          <div className="grid justify-items-start gap-[8px] py-[24px] text-[13px] text-muted-foreground">
            <p>{t("notes.noPagesMatch", { query: query.trim() })}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setQuery("")}>
              {t("notes.clearFilter")}
            </Button>
          </div>
        ) : (
          <ul aria-label={t("notes.pagesList")} className="m-0 list-none p-0">
            {visible.map(({ page, path, subpages }) => (
              <li key={page.id} className="border-b border-border/70 last:border-b-0">
                <Link to={`/notes/${page.id}`} className={rowClass}>
                  <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                    <PageIcon icon={page.icon} className="size-[16px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium leading-[1.4] text-foreground">
                      {pageTitle(page, t("notes.untitled"))}
                    </span>
                    {path.length > 0 ? (
                      <span className="mt-[1px] block truncate text-[12px] leading-[1.4] text-muted-foreground">
                        {trail(path)}
                      </span>
                    ) : null}
                  </span>
                  {subpages > 0 ? (
                    <span className="hidden shrink-0 text-[12px] tabular-nums text-muted-foreground sm:block">
                      {t(subpages === 1 ? "notes.subpage" : "notes.subpages", { count: subpages })}
                    </span>
                  ) : null}
                  <time
                    dateTime={page.updatedAt}
                    title={formatFullDate(page.updatedAt, locale)}
                    className="min-w-[62px] shrink-0 text-right text-[12px] tabular-nums leading-[1.4] text-muted-foreground"
                  >
                    {formatUpdatedAt(page.updatedAt, now, locale, t)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
