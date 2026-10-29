import { TiltCard } from "@/components/amicro/tilt-card";
import { NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import type { Book } from "./books-api";

/**
 * The shelf tone of a book. Four graphite values from the app's own chart ramp, chosen by the title, so a
 * shelf of books reads as cloth in different weights without introducing a single new hue.
 */
const shelfTones = ["var(--chart-4)", "var(--chart-3)", "var(--chart-2)", "var(--chart-1)"] as const;

function shelfToneFor(title: string): string {
  let hash = 0;
  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 31 + title.charCodeAt(index)) >>> 0;
  }
  return shelfTones[hash % shelfTones.length]!;
}


type BookCardProps = {
  book: Book;
  onSelect: (book: Book) => void;
  /** Opens the book's notebook, creating it on the spot when it does not exist yet. */
  onOpenNotebook: (book: Book) => void;
};

export function BookCard({ book, onSelect, onOpenNotebook }: BookCardProps) {
  const { t } = useT();
  const tone = shelfToneFor(book.title);
  const statusKey = `books.${book.status}`;

  return (
    <TiltCard
      maxTilt={4}
      className="group relative w-full min-w-0 !aspect-[3/4] !max-w-none"
      cardClassName="!rounded-lg !border-0 !bg-transparent !p-0 !shadow-none motion-reduce:!transform-none"
    >
      <div className="relative h-full w-full">
        <button
          type="button"
          onClick={() => onSelect(book)}
          aria-label={t("books.cardDetails", { title: book.title, status: t(statusKey) })}
          className={cn(
            "group/book absolute inset-0 flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border/70 bg-muted text-left outline-none",
            "transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-foreground/25 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          )}
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 z-10 w-1 opacity-70" style={{ background: tone }} />

          {book.coverUrl === null ? (
            <>
              <span className="flex flex-1 flex-col items-center justify-center gap-1.5 px-5 pl-7 text-center">
                <span className="text-sm leading-snug font-semibold tracking-tight text-balance text-foreground">
                  {book.title}
                </span>
                {book.author ? <span className="text-xs text-muted-foreground">{book.author}</span> : null}
              </span>

              <span className="flex items-center gap-2 border-t border-border/70 px-3 py-2.5 pl-5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground/70" />
                  {t(statusKey)}
                </span>
                {book.score === null ? null : (
                  <span className="ml-auto text-[11px] font-medium tabular-nums text-muted-foreground">{book.score}</span>
                )}
              </span>
            </>
          ) : (
            <>
              <img
                src={book.coverUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-150 group-hover/book:scale-[1.02] motion-reduce:transition-none"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 bg-gradient-to-t from-foreground/95 via-foreground/55 to-transparent p-3 pl-5 pt-12">
                <span className="text-[13px] leading-snug font-semibold tracking-tight text-balance text-background">
                  {book.title}
                </span>
                {book.author ? <span className="truncate text-[11px] text-background/75">{book.author}</span> : null}
                <span className="mt-1 flex items-center gap-2 text-[11px] text-background/85">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-background/80" />
                    {t(statusKey)}
                  </span>
                  {book.score === null ? null : (
                    <span className="ml-auto font-medium tabular-nums">{book.score}</span>
                  )}
                </span>
              </span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => onOpenNotebook(book)}
          aria-label={t("books.openNotebook", { title: book.title })}
          title={t("books.notebook")}
          className={cn(
            "absolute right-2 top-2 z-20 inline-flex size-8 items-center justify-center rounded-md border border-border/70 bg-background/90 text-muted-foreground opacity-0",
            "transition-[opacity,color,background-color] duration-150 hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:opacity-100 outline-none",
            "group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:size-11 [@media(hover:none)]:opacity-100 motion-reduce:transition-none",
          )}
        >
          <NotebookPen className="size-4" aria-hidden="true" />
        </button>
      </div>
    </TiltCard>
  );
}
