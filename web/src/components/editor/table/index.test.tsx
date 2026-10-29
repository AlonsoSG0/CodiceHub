import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { afterEach, describe, expect, it } from "vitest";
import { createTableSlashItem, TableControls } from "./index";

const tableExtensions = [StarterKit, Table.configure({ resizable: true }), TableRow, TableHeader, TableCell];

function getDocument(editor: Editor): JSONContent {
  return editor.getJSON() as JSONContent;
}

function makeEditor(content = "<p>outside</p>") {
  return new Editor({ extensions: tableExtensions, content });
}

function selectInsideTable(editor: Editor) {
  let paragraphPosition: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "paragraph" && paragraphPosition === null) paragraphPosition = position;
  });
  if (paragraphPosition === null) throw new Error("table paragraph not found");
  editor.commands.setTextSelection(paragraphPosition + 1);
}

function tableEditor() {
  const editor = makeEditor();
  editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
  selectInsideTable(editor);
  return editor;
}

afterEach(() => cleanup());

describe("table slash item", () => {
  it("inserts one 3x3 table with a header row after deleting the slash range", () => {
    const editor = makeEditor("<p>/table</p>");
    const item = createTableSlashItem();
    expect(item.id).toBe("table");
    item.command({ editor, range: { from: 1, to: 7 } });

    const tables = getDocument(editor).content?.filter((node) => node.type === "table") ?? [];
    expect(tables).toHaveLength(1);
    expect(tables[0].content).toHaveLength(3);
    expect(tables[0].content?.[0].content?.map((cell) => cell.type)).toEqual([
      "tableHeader",
      "tableHeader",
      "tableHeader",
    ]);
  });
});

describe("table controls", () => {
  it("adds a row below and deletes a row", () => {
    const editor = tableEditor();
    render(<TableControls editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Add row below" }));
    expect(getDocument(editor).content?.[0].content).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Delete row" }));
    expect(getDocument(editor).content?.[0].content).toHaveLength(3);
    editor.destroy();
  });

  it("adds a column right and deletes a column", () => {
    const editor = tableEditor();
    render(<TableControls editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Add column right" }));
    expect(getDocument(editor).content?.[0].content?.every((row) => row.content?.length === 4)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete column" }));
    expect(getDocument(editor).content?.[0].content?.every((row) => row.content?.length === 3)).toBe(true);
    editor.destroy();
  });

  it("toggles the header row", () => {
    const editor = tableEditor();
    render(<TableControls editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle header row" }));
    expect(getDocument(editor).content?.[0].content?.[0].content?.map((cell) => cell.type)).toEqual([
      "tableCell",
      "tableCell",
      "tableCell",
    ]);
    editor.destroy();
  });

  it("deletes the table", () => {
    const editor = tableEditor();
    render(<TableControls editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete table" }));
    expect(getDocument(editor).content?.some((node) => node.type === "table")).toBe(false);
    editor.destroy();
  });

  it("renders nothing when the selection is outside a table", () => {
    const editor = makeEditor();
    const { container } = render(<TableControls editor={editor} />);

    expect(container.firstChild).toBeNull();
    editor.destroy();
  });
});
