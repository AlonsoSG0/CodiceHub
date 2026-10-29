import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Callout,
  createCalloutSlashItem,
  createTableOfContentsSlashItem,
  createToggleSlashItem,
  TableOfContents,
  Toggle,
} from "./index";

function MountedEditor({ content, onReady }: { content: JSONContent; onReady?: (editor: Editor) => void }) {
  const editor = useEditor({
    extensions: [StarterKit, Callout, Toggle, TableOfContents],
    content,
    onCreate: ({ editor: created }) => onReady?.(created),
  });
  return <EditorContent editor={editor} />;
}

afterEach(cleanup);

function createDocumentEditor() {
  return new Editor({ extensions: [StarterKit, Callout, Toggle, TableOfContents] });
}

describe("editor block extensions", () => {
  it.each([
    ["callout", createCalloutSlashItem, "callout"],
    ["toggle", createToggleSlashItem, "toggle"],
    ["table of contents", createTableOfContentsSlashItem, "tableOfContents"],
  ])("inserts exactly one %s node from its slash item", (_label, createItem, type) => {
    const editor = createDocumentEditor();
    const item = createItem();
    item.command({ editor, range: { from: 1, to: 2 } });

    expect(editor.getJSON().content?.filter((node) => node.type === type)).toHaveLength(1);
    editor.destroy();
  });

  it("stores a changed callout emoji through a JSON round-trip", async () => {
    let editor: Editor | undefined;
    const content = { type: "doc", content: [{ type: "callout", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep this" }] }] }] } satisfies JSONContent;
    const view = render(<MountedEditor content={content} onReady={(created) => (editor = created)} />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose callout emoji" }));
    fireEvent.click(await screen.findByRole("button", { name: "🚀" }));
    await waitFor(() => expect(editor?.getJSON().content?.[0]?.attrs?.emoji).toBe("🚀"));
    expect(screen.getByTestId("callout-node").getAttribute("data-emoji")).toBe("🚀");
    const saved = JSON.parse(JSON.stringify(editor?.getJSON()));
    const roundTrip = new Editor({ extensions: [StarterKit, Callout], content: saved });
    expect(roundTrip.getJSON().content?.[0]?.attrs?.emoji).toBe("🚀");
    roundTrip.destroy();
    view.unmount();
    editor?.destroy();
  });

  it("stores a closed toggle while retaining its body in JSON", async () => {
    const content = { type: "doc", content: [{ type: "toggle", content: [
      { type: "toggleSummary", content: [{ type: "text", text: "Summary" }] },
      { type: "toggleContent", content: [{ type: "paragraph", content: [{ type: "text", text: "Persistent body" }] }] },
    ] }] } satisfies JSONContent;
    let mountedEditor: Editor | undefined;
    const view = render(<MountedEditor content={content} onReady={(created) => (mountedEditor = created)} />);
    fireEvent.click(await screen.findByRole("button", { name: "Collapse toggle" }));
    await waitFor(() => expect(mountedEditor?.getJSON().content?.[0]?.attrs?.open).toBe(false));
    expect(screen.getByTestId("toggle-node").getAttribute("data-open")).toBe("false");
    expect(screen.getByTestId("toggle-body").classList.contains("hidden")).toBe(true);
    expect(screen.getByText("Persistent body")).toBeTruthy();
    const saved = mountedEditor?.getJSON();
    expect(saved?.content?.[0]?.attrs?.open).toBe(false);
    expect(JSON.stringify(saved)).toContain("Persistent body");
    view.unmount();
    mountedEditor?.destroy();
    const editor = new Editor({ extensions: [StarterKit, Toggle], content });
    editor.commands.updateAttributes("toggle", { open: false });
    const recreated = editor.getJSON();
    expect(recreated.content?.[0]?.attrs?.open).toBe(false);
    expect(JSON.stringify(recreated)).toContain("Persistent body");
    editor.destroy();
  });

  it("lists current headings and adds a row after a heading is inserted", async () => {
    const editorRef: { current: Editor | null } = { current: null };
    function ReadyEditor() {
      const instance = useEditor({
        extensions: [StarterKit, TableOfContents],
        content: { type: "doc", content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "First" }] },
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Second" }] },
          { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Ignored" }] },
          { type: "tableOfContents" },
        ] },
      });
      editorRef.current = instance;
      return <EditorContent editor={instance} />;
    }
    const view = render(<ReadyEditor />);
    expect(await screen.findByRole("button", { name: "First" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Second" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ignored" })).toBeNull();
    act(() => {
      editorRef.current?.commands.insertContentAt(1, { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Added" }] });
    });
    expect(await screen.findByRole("button", { name: "Added" })).toBeTruthy();
    view.unmount();
    editorRef.current?.destroy();
  });

  it("renders a muted empty state when there are no headings", async () => {
    render(<MountedEditor content={{ type: "doc", content: [{ type: "tableOfContents" }, { type: "paragraph" }] }} />);
    expect(await screen.findByText("No headings yet.")).toBeTruthy();
  });
});
