import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

type SearchResult = { id: string; title: string; snippet: string };
type SearchStatus = "idle" | "debouncing" | "loading" | "results" | "empty" | "error";

const maxTerms = 32;
const maxTermLength = 64;

/** The palette listens on Mod-K; the badge says which modifier this platform actually uses. */
function searchShortcutLabel(t: (key: string) => string): string {
  if (typeof navigator === "undefined") return t("search.shortcutControl");
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
    ? t("search.shortcutMac")
    : t("search.shortcutControl");
}

function isSearchResponse(value: unknown): value is { results: SearchResult[] } {
  if (typeof value !== "object" || value === null || !("results" in value) || !Array.isArray(value.results)) {
    return false;
  }
  return value.results.every(
    (result) =>
      typeof result === "object" &&
      result !== null &&
      "id" in result && typeof result.id === "string" &&
      "title" in result && typeof result.title === "string" &&
      "snippet" in result && typeof result.snippet === "string",
  );
}

function queryTerms(query: string): string[] {
  return Array.from(query.matchAll(/[\p{L}\p{N}_]+/gu), ([term]) => term.slice(0, maxTermLength)).slice(0, maxTerms);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = queryTerms(query);
  if (terms.length === 0) return text;

  const matcher = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "giu");
  const termSet = new Set(terms.map((term) => term.toLocaleLowerCase()));
  return text.split(matcher).map((part, index) =>
    termSet.has(part.toLocaleLowerCase()) ? (
      <mark key={`${part}-${index}`} className="rounded-sm bg-foreground/10 px-0.5 font-semibold text-foreground">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function SearchPalette({ triggerClassName }: { triggerClassName?: string } = {}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      // Shift must be excluded: Mod-Shift-k belongs to the editor's link action, and without this
      // the palette opened on top of it and took the focus, so the URL was typed into the search box.
      if (event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      event.preventDefault();
      setOpen((current) => !current);
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
      inputRef.current?.focus();
      return;
    }

    if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus();
    restoreFocusRef.current = null;
  }, [open]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    setResults([]);
    setActiveIndex(-1);

    if (normalizedQuery.length === 0) {
      setStatus("idle");
      return;
    }

    let current = true;
    setStatus("debouncing");
    const timeout = window.setTimeout(() => {
      setStatus("loading");
      void fetch(`/api/search?q=${encodeURIComponent(normalizedQuery)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error("search_failed");
          const body: unknown = await response.json();
          if (!isSearchResponse(body)) throw new Error("invalid_search_response");
          return body.results;
        })
        .then((nextResults) => {
          if (!current) return;
          setResults(nextResults);
          setActiveIndex(nextResults.length > 0 ? 0 : -1);
          setStatus(nextResults.length > 0 ? "results" : "empty");
        })
        .catch(() => {
          if (!current) return;
          setStatus("error");
        });
    }, 250);

    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  const close = () => setOpen(false);

  const moveActive = (direction: -1 | 1) => {
    if (results.length === 0) return;
    setActiveIndex((current) => (current + direction + results.length) % results.length);
  };

  const selectResult = (result: SearchResult) => {
    close();
    navigate(`/notes/${encodeURIComponent(result.id)}`);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      selectResult(results[activeIndex]!);
    }
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t("search.pages")}
        aria-haspopup="dialog"
        className={cn("gap-2 text-muted-foreground", triggerClassName)}
        onClick={() => setOpen(true)}
      >
        <Search size={15} aria-hidden="true" />
        <span className="truncate">{t("search.search")}</span>
        <kbd
          aria-hidden="true"
          className="ml-auto shrink-0 rounded-[3px] border border-sidebar-border px-1 text-[10px] font-normal leading-4 text-muted-foreground"
        >
          {searchShortcutLabel(t)}
        </kbd>
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="search-dialog-title"
        aria-modal="true"
        className="fixed inset-0 m-auto max-h-[min(80dvh,38rem)] w-[min(40rem,calc(100%-2rem))] overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 id="search-dialog-title" className="text-base font-semibold">{t("search.pages")}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            {t("search.close")}
          </Button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <label className="sr-only" htmlFor="page-search-input">{t("search.pages")}</label>
          <input
            ref={inputRef}
            id="page-search-input"
            type="search"
            role="combobox"
            aria-label={t("search.pages")}
            aria-autocomplete="list"
            aria-expanded={status === "results"}
            aria-controls="page-search-results"
            aria-activedescendant={activeIndex >= 0 ? `search-result-${results[activeIndex]?.id}` : undefined}
            autoComplete="off"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
          />
        </div>

        <div className="max-h-[min(55dvh,28rem)] overflow-y-auto p-2" aria-live="polite">
          {status === "idle" ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("search.typeToSearch")}</p> : null}
          {status === "debouncing" || status === "loading" ? (
            <p role="status" className="px-3 py-8 text-center text-sm text-muted-foreground">{t("search.searching")}</p>
          ) : null}
          {status === "empty" ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("search.noResults", { query: query.trim() })}</p> : null}
          {status === "error" ? <p role="alert" className="px-3 py-8 text-center text-sm text-destructive">{t("search.unavailable")}</p> : null}
          {status === "results" ? (
            <div id="page-search-results" role="listbox" aria-label={t("search.results")} className="grid gap-1">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  id={`search-result-${result.id}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  className="grid w-full gap-1 rounded-md px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted aria-selected:bg-muted"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(result)}
                >
                  <span className="truncate text-sm font-medium"><HighlightedText text={result.title} query={query} /></span>
                  {result.snippet !== result.title ? (
                    <span className="line-clamp-2 text-sm text-muted-foreground"><HighlightedText text={result.snippet} query={query} /></span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{t("search.keyboardHelp")}</p>
      </dialog>
    </>
  );
}
