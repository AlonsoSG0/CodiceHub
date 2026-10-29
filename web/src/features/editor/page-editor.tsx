import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { useWorkspaceOutletContext } from "@/components/layout/workspace-outlet-context";
import { NoteEditor } from "@/components/editor/note-editor";
import { fetchPage, createPage } from "@/lib/api";
import { PageIconPicker } from "@/features/pages/page-icon-picker";
import { PageBacklinks } from "@/features/pages/backlinks";
import type { Page } from "@/lib/api";
import { useAutosave } from "./use-autosave.js";
import type { SaveOptions } from "./use-autosave.js";
import { usePublishEditor } from "./editor-bridge";
import { useT } from "@/i18n";

type PageLoadState =
  | { status: "loading" }
  | { status: "loaded"; page: Page }
  | { status: "error"; message: string };

type PagePatch = { title?: string; content?: JSONContent; icon?: string | null };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

async function patchPage(pageId: string, patch: PagePatch, options?: SaveOptions): Promise<void> {
  const body = JSON.stringify(patch);
  // Browsers cap a keepalive body at 64 KiB; a big document falls back to the ordinary request.
  const keepalive = options?.keepalive === true && body.length < 60_000;
  const response = await fetch(`/api/pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive,
  });

  if (response.ok) return;

  let code = `http_${response.status}`;
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
      code = body.error;
    }
  } catch {
    // Keep the HTTP status as the fallback when an error response is not JSON.
  }
  throw new Error(code);
}

async function postImageUpload(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", body: form });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const code =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `http_${response.status}`;
    throw new Error(code);
  }
  if (typeof body !== "object" || body === null || !("url" in body) || typeof body.url !== "string") {
    throw new Error("invalid_upload_response");
  }
  return body.url;
}

function LoadedPageEditor({ page }: { page: Page }) {
  const { t } = useT();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [content, setContent] = useState(page.content as JSONContent);
  const [bodyEditPending, setBodyEditPending] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const publishEditor = usePublishEditor();
  const { updatePageMeta, renameRequest, pages = [], refreshTree } = useWorkspaceOutletContext();

  const uploadImage = useCallback((file: File) => postImageUpload(file), []);
  const saveTitle = useCallback(
    async (nextTitle: string, options?: SaveOptions) => {
      await patchPage(page.id, { title: nextTitle }, options);
      updatePageMeta?.(page.id, { updatedAt: new Date().toISOString() });
    },
    [page.id, updatePageMeta],
  );
  const saveContent = useCallback(
    async (nextContent: JSONContent, options?: SaveOptions) => {
      await patchPage(page.id, { content: nextContent }, options);
      updatePageMeta?.(page.id, { updatedAt: new Date().toISOString() });
    },
    [page.id, updatePageMeta],
  );
  const titleAutosave = useAutosave(saveTitle);
  const contentAutosave = useAutosave(saveContent);

  const saveIcon = async (nextIcon: string | null) => {
    await patchPage(page.id, { icon: nextIcon });
    setIcon(nextIcon);
    updatePageMeta?.(page.id, { icon: nextIcon, updatedAt: new Date().toISOString() });
  };

  const onTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTitle = event.currentTarget.value;
    setTitle(nextTitle);
    // Keep the sidebar label in step with the title while it is being typed.
    updatePageMeta?.(page.id, { title: nextTitle });
    titleAutosave.scheduleSave(nextTitle);
  };

  useEffect(() => {
    if (renameRequest?.pageId !== page.id) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [renameRequest, page.id]);

  const handleCreateSubpage = useCallback(
    async (parentId: string | null) => {
      const created = await createPage({ parentId });
      void refreshTree?.();
      return { id: created.id, title: created.title };
    },
    [refreshTree],
  );

  const onEditorReady = useCallback(
    (editor: Editor | null) => {
      editorRef.current = editor;
      publishEditor(editor);
    },
    [publishEditor],
  );

  const onTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    editorRef.current?.commands.focus("start");
  };

  const onContentChange = (nextContent: JSONContent) => {
    setBodyEditPending(false);
    setContent(nextContent);
    contentAutosave.scheduleSave(nextContent);
  };

  const status =
    titleAutosave.status === "Saving…" || contentAutosave.status === "Saving…"
      ? "Saving…"
      : titleAutosave.status === "Save failed" || contentAutosave.status === "Save failed"
        ? "Save failed"
        : bodyEditPending ||
            titleAutosave.status === "Unsaved" ||
            contentAutosave.status === "Unsaved" ||
            titleAutosave.hasPendingSave ||
            contentAutosave.hasPendingSave
          ? "Unsaved"
          : titleAutosave.status === "Saved" || contentAutosave.status === "Saved"
            ? "Saved"
            : "Idle";

  return (
    <section
      className="page-column page-editor"
      aria-label={t("editor.pageEditorLabel")}
      onInputCapture={(event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.getAttribute("aria-label") === "Page content") {
          setBodyEditPending(true);
        }
      }}
    >
      <div className="page-editor-heading">
        <PageIconPicker currentIcon={icon} titleInputRef={titleInputRef} onSave={saveIcon} />
        <h1 className="page-title" aria-label={title || t("editor.untitled")}>
          <input
            ref={titleInputRef}
            aria-label={t("editor.pageTitleLabel")}
            className="page-title-input"
            type="text"
            value={title}
            placeholder={t("editor.untitled")}
            onChange={onTitleChange}
            onKeyDown={onTitleKeyDown}
          />
        </h1>
        <span className="page-editor-status" role="status" aria-live="polite">
          {status}
        </span>
      </div>
      <NoteEditor
        value={content}
        onChange={onContentChange}
        placeholder={t("editor.writingPlaceholder")}
        uploadImage={uploadImage}
        onEditorReady={onEditorReady}
        pageId={page.id}
        pages={pages}
        onCreateSubpage={handleCreateSubpage}
      />
      <PageBacklinks pageId={page.id} />
    </section>
  );
}

export function PageEditor({ pageId }: { pageId: string }) {
  const { t } = useT();
  const [state, setState] = useState<PageLoadState>({ status: "loading" });

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });

    fetchPage(pageId).then(
      (page) => {
        if (current) setState({ status: "loaded", page });
      },
      (error: unknown) => {
        if (current) setState({ status: "error", message: getErrorMessage(error) });
      },
    );

    return () => {
      current = false;
    };
  }, [pageId]);

  if (state.status === "loading") {
    return (
      <section className="page-column" aria-labelledby="page-loading-title">
        <h1 id="page-loading-title" className="page-title">
          Page placeholder
        </h1>
        <p className="page-placeholder-copy">{t("editor.pageId", { pageId })}</p>
        <LoadingSkeleton label="Loading page" />
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="page-column" role="alert" aria-labelledby="page-error-title">
        <h1 id="page-error-title" className="page-title">
          {state.message === "page_not_found" ? "Page not found" : "Could not load page"}
        </h1>
        <p className="page-placeholder-copy">{state.message}</p>
      </section>
    );
  }

  return <LoadedPageEditor key={pageId} page={state.page} />;
}
