import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMentionTrigger, createPageMention, createPageSlashItem } from "./index";

const pages = [
  { id: "p1", title: "Alpha page" },
  { id: "p2", title: "Alpine notes" },
  { id: "p3", title: "Beta page" },
];

function MountedEditor({
  extensions,
  onReady,
  content,
}: {
  extensions: Array<ReturnType<typeof createPageMention> | ReturnType<typeof createMentionTrigger>>;
  onReady: (editor: Editor) => void;
  content?: JSONContent;
}) {
  const editor = useEditor({
    extensions: [StarterKit, ...extensions] as never,
    content,
    onCreate: ({ editor: created }) => onReady(created),
  });
  return <EditorContent editor={editor} />;
}

afterEach(cleanup);

function renderInRouter(node: ReactElement) {
  return render(
    <MemoryRouter>
      {node}
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** A mention is a route change, so the test reads the router's own location instead of the browser's. */
function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe("page mentions", () => {
  it("stays silent on @ when there is no page list to suggest", async () => {
    let editor: Editor | undefined;
    renderInRouter(
      <MountedEditor
        extensions={[
          createPageMention({ resolveTitle: () => null }),
          createMentionTrigger({ getPages: () => [] }),
        ]}
        onReady={(value) => (editor = value)}
      />,
    );
    await waitFor(() => expect(editor).toBeDefined());

    await act(async () => {
      editor!.commands.insertContent("@");
    });

    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("opens on @, filters case-insensitively, and Enter inserts the chosen page id", async () => {
    let editor: Editor | undefined;
    renderInRouter(
      <MountedEditor
        extensions={[createPageMention({ resolveTitle: (id: string) => pages.find((page) => page.id === id)?.title ?? null }), createMentionTrigger({ getPages: () => pages })]}
        onReady={(value) => (editor = value)}
      />,
    );
    await waitFor(() => expect(editor).toBeDefined());

    act(() => editor!.commands.insertContent("@"));
    expect(await screen.findByRole("listbox", { name: "Pages" })).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(3);

    act(() => editor!.commands.insertContent("ALP"));
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    expect(screen.getByText("Alpha page")).toBeTruthy();
    expect(screen.getByText("Alpine notes")).toBeTruthy();

    const editable = document.querySelector("[contenteditable=true]")!;
    fireEvent.keyDown(editable, { key: "Enter" });
    await waitFor(() => {
      const mentions = (editor!.getJSON() as JSONContent).content?.[0]?.content?.filter((node) => node.type === "pageMention") ?? [];
      expect(mentions).toHaveLength(1);
      expect(mentions[0]?.attrs?.pageId).toBe("p1");
    });
  });

  it("renders the current resolved title and reads it again after a resolver change", async () => {
    let title = "Original title";
    let editor: Editor | undefined;
    const content: JSONContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "pageMention", attrs: { pageId: "p1" } }] }] };
    const extensions = [createPageMention({ resolveTitle: () => title })];
    const view = renderInRouter(
      <MountedEditor
        extensions={extensions}
        onReady={(value) => (editor = value)}
        content={content}
      />,
    );
    await waitFor(() => expect(editor).toBeDefined());
    expect(await screen.findByRole("link", { name: "Original title" })).toBeTruthy();

    const savedBeforeRename = editor!.getJSON();
    title = "Renamed page";
    view.unmount();
    renderInRouter(<MountedEditor extensions={extensions} onReady={(value) => (editor = value)} content={savedBeforeRename} />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Renamed page" })).toBeTruthy());
    expect(editor!.getJSON()).toEqual(savedBeforeRename);
  });

  it("inserts the page mention returned by the /page callback", async () => {
    const editor = new Editor({ extensions: [StarterKit, createPageMention({ resolveTitle: () => "Child" })] });
    const callback = vi.fn(async () => ({ id: "child-1", title: "Child" }));
    const item = createPageSlashItem({ parentId: "parent-1", onCreateSubpage: callback });
    await item.command({ editor, range: { from: 1, to: 1 } });

    expect(callback).toHaveBeenCalledWith("parent-1");
    const mention = (editor.getJSON() as JSONContent).content?.flatMap((node) => node.content ?? []).find((node) => node.type === "pageMention");
    expect(mention?.attrs?.pageId).toBe("child-1");
    editor.destroy();
  });

  it("does not insert or throw when subpage creation rejects", async () => {
    const editor = new Editor({ extensions: [StarterKit, createPageMention({ resolveTitle: () => null })] });
    const onCreateSubpage = vi.fn(async () => { throw new Error("failed"); });
    const item = createPageSlashItem({ parentId: null, onCreateSubpage });
    await expect(item.command({ editor, range: { from: 1, to: 1 } })).resolves.toBeUndefined();
    expect(onCreateSubpage).toHaveBeenCalledWith(null);
    expect((editor.getJSON() as JSONContent).content?.flatMap((node) => node.content ?? []).some((node) => node.type === "pageMention")).toBe(false);
    editor.destroy();
  });

  it("opens the mentioned page when the mention is clicked", async () => {
    const content: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "pageMention", attrs: { pageId: "p1" } }] }],
    };
    let editor: Editor | undefined;
    renderInRouter(
      <MountedEditor
        extensions={[createPageMention({ resolveTitle: () => "Alpha page" })]}
        onReady={(value) => (editor = value)}
        content={content}
      />,
    );
    await waitFor(() => expect(editor).toBeDefined());

    const link = await screen.findByRole("link", { name: "Alpha page" });
    expect(link.getAttribute("href")).toBe("/notes/p1");

    fireEvent.click(link);
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/notes/p1"));
  });

  it("round-trips pageId through editor JSON", () => {
    const extensions = [StarterKit, createPageMention({ resolveTitle: () => "Page" })];
    const content: JSONContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "pageMention", attrs: { pageId: "stable-id" } }] }] };
    const first = new Editor({ extensions, content });
    const saved = first.getJSON();
    const second = new Editor({ extensions, content: saved });
    expect((second.getJSON() as JSONContent).content?.[0]?.content?.[0]?.attrs?.pageId).toBe("stable-id");
    first.destroy();
    second.destroy();
  });
});
