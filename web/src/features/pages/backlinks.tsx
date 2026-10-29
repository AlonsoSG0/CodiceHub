import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PageBacklink } from "@/lib/api";
import { fetchBacklinks } from "@/lib/api";
import { PageIcon } from "./page-icon.js";
import { useT } from "@/i18n";

function titleOf(link: PageBacklink, untitled: string): string {
  return link.title.trim() || untitled;
}

/**
 * Who links here. Backlinks are additive context, never a gate: a failed request hides the section instead of
 * putting an error box inside the document the reader is writing.
 */
export function PageBacklinks({ pageId }: { pageId: string }) {
  const { t } = useT();
  const [links, setLinks] = useState<PageBacklink[]>([]);

  useEffect(() => {
    let current = true;
    setLinks([]);
    void fetchBacklinks(pageId)
      .then((next) => {
        if (current) setLinks(next);
      })
      .catch(() => {
        if (current) setLinks([]);
      });
    return () => {
      current = false;
    };
  }, [pageId]);

  if (links.length === 0) return null;

  return (
    <section aria-labelledby="backlinks-heading" className="mt-14 border-t border-border pt-4">
      <h2 id="backlinks-heading" className="text-[11px] font-medium leading-[1.4] text-muted-foreground">
        {t("notes.linkedFromCount", { count: links.length })}
      </h2>
      <ul aria-label={t("notes.linkedFrom")} className="mt-2 m-0 grid list-none gap-0.5 p-0">
        {links.map((link) => (
          <li key={link.id}>
            <Link
              to={`/notes/${link.id}`}
              className="flex min-h-10 items-center gap-2 rounded-[4px] px-2 text-inherit no-underline transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            >
              <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                <PageIcon icon={link.icon} className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-[1.4] text-foreground">
                  {titleOf(link, t("notes.untitled"))}
                </span>
                {link.context ? (
                  <span className="block truncate text-[12px] leading-[1.4] text-muted-foreground">{link.context}</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
