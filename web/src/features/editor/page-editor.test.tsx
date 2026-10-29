import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useCallback } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";
import { NoteEditor } from "@/components/editor/note-editor";
import { PageEditor } from "./page-editor";
import { EditorBridgeProvider, EditorHistoryControls, usePublishEditor } from "./editor-bridge";
import type { PageBacklink } from "@/lib/api";

const emptyDocument: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
const reportedDocument: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", attrs: { textAlign: null }, content: [{ type: "text", text: "A saved thought" }] }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function installPageApi(failPatches = 0, deferPatch = false, backlinks: PageBacklink[] = []) {
  const requests: { url: string; method: string; body?: string; keepalive: boolean }[] = [];
  let failuresLeft = failPatches;
  let resolvePatch: ((response: Response) => void) | null = null;
  const page = {
    id: "page-1",
    parentId: null,
    title: "Field notes",
    position: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    content: emptyDocument,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : undefined;
    requests.push({ url, method, body, keepalive: init?.keepalive === true });

    if (url === "/api/pages/page-1" && method === "GET") return jsonResponse(page);
    if (url === "/api/pages/page-1/backlinks" && method === "GET") return jsonResponse({ backlinks });
    if (url === "/api/pages/page-1" && method === "PATCH") {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        return jsonResponse({ error: "internal_error" }, 500);
      }
      if (deferPatch) {
        return new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        });
      }
      return jsonResponse({ ...page, ...(body ? JSON.parse(body) : {}) });
    }
    return jsonResponse({ error: "page_not_found" }, 404);
  });

  vi.stubGlobal("fetch", fetchMock);
  return {
    requests,
    patches: () => requests.filter((request) => request.method === "PATCH"),
    resolveNextPatch: () => {
      if (!resolvePatch) throw new Error("No deferred PATCH is waiting");
      resolvePatch(jsonResponse(page));
      resolvePatch = null;
    },
  };
}

async function mountPageEditor() {
  render(
    <MemoryRouter>
      <PageEditor pageId="page-1" />
    </MemoryRouter>,
  );
  await screen.findByRole("textbox", { name: "Page title" });
}

function pasteImage(editor: HTMLElement, file: File) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [file],
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      getData: () => "",
    },
  });
  editor.dispatchEvent(event);
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function editBody(text: string) {
  const editor = screen.getByRole("textbox", { name: "Page content" });
  editor.innerHTML = `<p>${text}</p>`;
  fireEvent.input(editor, { inputType: "insertText", data: text });
}

function parsedPatch(request: { body?: string }) {
  return JSON.parse(request.body ?? "{}") as Record<string, unknown>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const ignoreChange = () => undefined;

function HistoryHarness({ holder }: { holder: { editor: Editor | null } }) {
  const publish = usePublishEditor();
  const ready = useCallback(
    (editor: Editor | null) => {
      holder.editor = editor;
      publish(editor);
    },
    [holder, publish],
  );
  return <NoteEditor value={emptyDocument} onChange={ignoreChange} onEditorReady={ready} />;
}

describe("reusable note editor and page autosave", () => {
  it("mounts the prop-driven note editor without making network requests", async () => {
    const fetchMock = vi.fn();
    const onChange = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<NoteEditor value={emptyDocument} onChange={onChange} />);

    expect(await screen.findByRole("textbox", { name: "Page content" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves the caret into the body when Enter is pressed in the title", async () => {
    installPageApi();
    await mountPageEditor();

    const title = screen.getByRole("textbox", { name: "Page title" });
    const body = await screen.findByRole("textbox", { name: "Page content" });
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    title.focus();

    fireEvent.keyDown(title, { key: "Enter" });

    // jsdom cannot focus a contenteditable element, so assert the focus call the browser performs.
    await waitFor(() => expect(focusSpy.mock.instances).toContain(body));
  });

  it("posts an image file to the uploads endpoint from the page editor", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const page = {
      id: "page-1",
      parentId: null,
      title: "Field notes",
      position: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      content: emptyDocument,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/pages/page-1" && (init?.method ?? "GET") === "GET") return jsonResponse(page);
      if (url === "/api/uploads" && init?.method === "POST") {
        return jsonResponse({ url: "/uploads/uploaded.png", mime: "image/png", width: 1, height: 1 }, 201);
      }
      return jsonResponse({ ...page, ...(typeof init?.body === "string" ? JSON.parse(init.body) : {}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PageEditor pageId="page-1" />);
    const editor = await screen.findByRole("textbox", { name: "Page content" });
    const file = new File([new Uint8Array([137, 80, 78, 71])], "pasted.png", { type: "image/png" });
    vi.useFakeTimers();

    await act(async () => {
      pasteImage(editor, file);
      await Promise.resolve();
      await Promise.resolve();
    });

    const uploadRequest = calls.find(({ url }) => url === "/api/uploads");
    expect(uploadRequest).toBeDefined();
    expect(uploadRequest?.init?.method).toBe("POST");
    expect(uploadRequest?.init?.body).toBeInstanceOf(FormData);
    expect((uploadRequest?.init?.body as FormData | undefined)?.get("file")).toBe(file);
    expect(editor.querySelector("img")?.getAttribute("src")).toBe("/uploads/uploaded.png");

    await advance(700);
    const patch = calls.find(({ url, init }) => url === "/api/pages/page-1" && init?.method === "PATCH");
    expect(patch).toBeDefined();
    const savedContent = JSON.parse(patch?.init?.body as string).content as JSONContent;
    expect(savedContent.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image", attrs: expect.objectContaining({ src: "/uploads/uploaded.png" }) }),
      ]),
    );
  });

  it("lists the pages that link here with the sentence that carries the mention", async () => {
    installPageApi(0, false, [{ id: "source-1", title: "Weekly review", icon: null, context: "See the plan" }]);
    await mountPageEditor();

    expect(await screen.findByRole("heading", { name: "Linked from 1" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Linked from" });
    expect(within(list).getByRole("link", { name: /Weekly review/ }).getAttribute("href")).toBe("/notes/source-1");
    expect(within(list).getByText("See the plan")).toBeTruthy();
  });

  it("hides the backlink section when there is nothing linking here", async () => {
    installPageApi();
    await mountPageEditor();

    await waitFor(() => expect(screen.queryByRole("heading", { name: /Linked from/ })).toBeNull());
  });

  it("debounces a title save until 700 ms and transitions Unsaved to Saving… to Saved", async () => {
    const api = installPageApi(0, true);
    await mountPageEditor();
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole("textbox", { name: "Page title" }), {
      target: { value: "Revised title" },
    });
    expect(screen.getByRole("status").textContent).toBe("Unsaved");
    await advance(699);
    expect(api.patches()).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("Unsaved");

    await advance(1);
    expect(api.patches()).toHaveLength(1);
    expect(parsedPatch(api.patches()[0]!)).toEqual({ title: "Revised title" });
    expect(screen.getByRole("status").textContent).toBe("Saving…");

    await act(async () => {
      api.resolveNextPatch();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("shows Unsaved immediately and throughout the title debounce window", async () => {
    const api = installPageApi(0, true);
    await mountPageEditor();
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole("textbox", { name: "Page title" }), {
      target: { value: "A dirty title" },
    });
    expect(screen.getByRole("status").textContent).toBe("Unsaved");
    expect(screen.getByRole("status").textContent).not.toBe("Idle");

    await advance(699);
    expect(api.patches()).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("Unsaved");

    await advance(1);
    expect(api.patches()).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Saving…");
    await act(async () => {
      api.resolveNextPatch();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("flushes the pending save when the tab is hidden, with a keepalive request", async () => {
    const api = installPageApi();
    await mountPageEditor();
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole("textbox", { name: "Page title" }), { target: { value: "Typed and closed" } });
    expect(api.patches()).toHaveLength(0);

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.patches()).toHaveLength(1);
    expect(api.patches()[0]?.keepalive).toBe(true);
    expect(parsedPatch(api.patches()[0]!)).toEqual({ title: "Typed and closed" });
  });

  it("coalesces rapid title edits into one PATCH carrying the last value", async () => {
    const api = installPageApi();
    await mountPageEditor();
    vi.useFakeTimers();

    const title = screen.getByRole("textbox", { name: "Page title" });
    fireEvent.change(title, { target: { value: "First draft" } });
    await advance(300);
    fireEvent.change(title, { target: { value: "Second draft" } });
    await advance(300);
    fireEvent.change(title, { target: { value: "Final title" } });
    await advance(699);
    expect(api.patches()).toHaveLength(0);

    await advance(1);
    expect(api.patches()).toHaveLength(1);
    expect(parsedPatch(api.patches()[0]!)).toEqual({ title: "Final title" });
  });

  it("shows a failed save until the retry actually starts", async () => {
    const api = installPageApi(1, true);
    await mountPageEditor();
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole("textbox", { name: "Page title" }), {
      target: { value: "Retry this title" },
    });
    await advance(700);
    expect(api.patches()).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Save failed");

    await advance(699);
    expect(api.patches()).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Save failed");
    await advance(1);
    expect(api.patches()).toHaveLength(2);
    expect(parsedPatch(api.patches()[1]!)).toEqual({ title: "Retry this title" });
    expect(screen.getByRole("status").textContent).toBe("Saving…");
    await act(async () => {
      api.resolveNextPatch();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("flushes a pending title debounce when the page editor unmounts", async () => {
    const api = installPageApi();
    const view = render(<PageEditor pageId="page-1" />);
    await screen.findByRole("textbox", { name: "Page title" });
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole("textbox", { name: "Page title" }), {
      target: { value: "Last edit before leaving" },
    });
    await advance(699);
    expect(api.patches()).toHaveLength(0);

    view.unmount();
    expect(api.patches()).toHaveLength(1);
    expect(parsedPatch(api.patches()[0]!)).toEqual({ title: "Last edit before leaving" });
  });

  it("shows Unsaved immediately for a body edit through its debounce window", async () => {
    const api = installPageApi(0, true);
    await mountPageEditor();
    await screen.findByRole("textbox", { name: "Page content" });
    vi.useFakeTimers();

    editBody("A saved thought");
    expect(screen.getByRole("status").textContent).toBe("Unsaved");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Unsaved");
    await advance(699);
    expect(api.patches()).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("Unsaved");

    await advance(1);
    expect(api.patches()).toHaveLength(1);
    expect(parsedPatch(api.patches()[0]!)).toEqual({ content: reportedDocument });
    expect(screen.getByRole("status").textContent).toBe("Saving…");
    await act(async () => {
      api.resolveNextPatch();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("autosaves title independently from the body and PATCHes the editor-reported JSON unchanged", async () => {
    const api = installPageApi();
    await mountPageEditor();
    vi.useFakeTimers();

    editBody("A saved thought");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await advance(700);

    expect(api.patches()).toHaveLength(1);
    expect(parsedPatch(api.patches()[0]!)).toEqual({ content: reportedDocument });

    fireEvent.change(screen.getByRole("textbox", { name: "Page title" }), {
      target: { value: "Title saved separately" },
    });
    await advance(700);
    expect(api.patches()).toHaveLength(2);
    expect(parsedPatch(api.patches()[1]!)).toEqual({ title: "Title saved separately" });
  });

  it("undoes and redoes editor history through the toolbar controls", async () => {
    const holder: { editor: Editor | null } = { editor: null };
    render(
      <EditorBridgeProvider>
        <EditorHistoryControls />
        <HistoryHarness holder={holder} />
      </EditorBridgeProvider>,
    );

    const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    const redo = screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement;
    await screen.findByRole("textbox", { name: "Page content" });
    await waitFor(() => expect(holder.editor).not.toBeNull());

    // A freshly mounted page has no editor history, so neither control is available.
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    // Drive the history with a real ProseMirror transaction: the innerHTML+input helper
    // used elsewhere never reaches the editor state in jsdom, so it cannot create history.
    await act(async () => {
      holder.editor!.commands.insertContent("Original thought");
    });
    await waitFor(() => expect(undo.disabled).toBe(false));

    await act(async () => {
      fireEvent.click(undo);
    });
    await waitFor(() => expect(holder.editor!.getText()).toBe(""));
    await waitFor(() => expect(redo.disabled).toBe(false));

    await act(async () => {
      fireEvent.click(redo);
    });
    await waitFor(() => expect(holder.editor!.getText()).toBe("Original thought"));
  });

  it("reports the edited Tiptap document through the reusable component callback", async () => {
    const onChange = vi.fn();
    render(<NoteEditor value={emptyDocument} onChange={onChange} />);
    await screen.findByRole("textbox", { name: "Page content" });

    editBody("A saved thought");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenLastCalledWith(reportedDocument);
  });
});
