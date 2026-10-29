import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { JSONContent } from "@tiptap/core";
import { ArrowLeft, House } from "lucide-react";
import { Link } from "react-router-dom";
import { NoteEditor } from "@/components/editor/note-editor";
import { EditorBridgeProvider, EditorHistoryControls } from "@/features/editor/editor-bridge";
import { useAutosave } from "@/features/editor/use-autosave";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/i18n";
import { uploadImage } from "@/lib/api";
import { fetchBook, fetchBookNotebook, saveBookNotebook, type Book } from "./books-api";

type NotebookState =
  | { status: "loading" }
  | { status: "ready"; book: Book; content: JSONContent }
  | { status: "error"; message: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

/**
 * A book's notebook: the same editor the notes use, with no tree of its own. One page per book, and the
 * page cannot spawn sub-pages.
 */
function NotebookBody({ bookId }: { bookId: string }) {
  const { t } = useT();
  const [state, setState] = useState<NotebookState>({ status: "loading" });

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });

    Promise.all([fetchBook(bookId), fetchBookNotebook(bookId)]).then(
      ([book, notebook]) => {
        if (current) setState({ status: "ready", book, content: notebook.content as JSONContent });
      },
      (error: unknown) => {
        if (current) setState({ status: "error", message: messageOf(error) });
      },
    );

    return () => {
      current = false;
    };
  }, [bookId]);

  if (state.status === "loading") {
    return (
      <div className="py-8">
        <LoadingSkeleton label={t("books.notebookLoading")} className="min-h-32" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <section role="alert" className="py-8">
        <h1 className="text-xl font-semibold text-foreground">{state.message === "notebook_not_found" ? t("books.notebookMissing") : t("books.notebookError")}</h1>
      </section>
    );
  }

  return <LoadedNotebook book={state.book} bookId={bookId} initialContent={state.content} />;
}

function LoadedNotebook({ book, bookId, initialContent }: { book: Book; bookId: string; initialContent: JSONContent }) {
  const { t } = useT();
  const [content, setContent] = useState(initialContent);

  const save = async (next: JSONContent) => {
    await saveBookNotebook(bookId, next);
  };
  const autosave = useAutosave(save);

  const statusKeys = {
    Idle: "books.saved",
    Unsaved: "books.unsaved",
    "Saving…": "books.saving",
    Saved: "books.saved",
    "Save failed": "books.saveFailed",
  } as const;
  const status = t(statusKeys[autosave.status]);

  return (
    <section className="page-editor" aria-label={t("books.bookNotebook")}>
      <div className="page-editor-heading">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-xl font-semibold tracking-tight text-foreground" aria-label={book.title}>
            {book.title}
          </h1>
          <p className="text-[13px] text-muted-foreground">{book.author ?? t("books.unknownAuthor")}</p>
        </div>
        <span className="page-editor-status" role="status" aria-live="polite">
          {status}
        </span>
      </div>
      <NoteEditor
        value={content}
        onChange={(next) => {
          setContent(next);
          autosave.scheduleSave(next);
        }}
        placeholder={t("books.notesPlaceholder")}
        uploadImage={uploadImage}
      />
    </section>
  );
}

export function BookNotebookPage() {
  const { bookId = "" } = useParams();
  const { t } = useT();

  return (
    <EditorBridgeProvider>
      <main className="min-h-dvh w-full">
        <div className="dock-safe-bottom mx-auto w-full max-w-[720px] px-4 pt-6 sm:px-6 sm:pt-8">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label={t("books.navigation")} className="flex items-center gap-1">
              <Link
                to="/books"
                aria-label={t("books.back")}
                title={t("books.back")}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none motion-reduce:transition-none"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t("books.booksLink")}
              </Link>
              <Link
                to="/"
                aria-label={t("books.homeLink")}
                title={t("books.homeTitleLink")}
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
              >
                <House className="size-4" aria-hidden="true" />
              </Link>
            </nav>
            <div className="flex items-center gap-1">
              <EditorHistoryControls />
              <div className="[&>button]:size-9">
                <ThemeToggle />
              </div>
              <div className="[&>button]:size-9">
                <LanguageToggle />
              </div>
            </div>
          </header>
          <NotebookBody bookId={bookId} />
        </div>
      </main>
    </EditorBridgeProvider>
  );
}
