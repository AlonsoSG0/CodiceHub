import type { Editor } from "@tiptap/core";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  Rows3,
  Table2,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { SlashCommandSuggestionItem } from "@/components/block-editor";

export function createTableSlashItem(): SlashCommandSuggestionItem {
  return {
    id: "table",
    title: "Table",
    description: "Insert a 3 by 3 table with a header row.",
    icon: <Table2 size={16} />,
    keywords: ["table", "grid", "rows", "columns"],
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  };
}

const actions = [
  { label: "Add row above", icon: ArrowUp, command: "addRowBefore" },
  { label: "Add row below", icon: ArrowDown, command: "addRowAfter" },
  { label: "Delete row", icon: Rows3, command: "deleteRow" },
  { label: "Add column left", icon: ArrowLeft, command: "addColumnBefore" },
  { label: "Add column right", icon: ArrowRight, command: "addColumnAfter" },
  { label: "Delete column", icon: Columns3, command: "deleteColumn" },
  { label: "Toggle header row", icon: Table2, command: "toggleHeaderRow" },
  { label: "Delete table", icon: Trash2, command: "deleteTable" },
] as const;

export function TableControls({ editor }: { editor: Editor | null }) {
  const [insideTable, setInsideTable] = useState(() => Boolean(editor?.isActive("table")));

  useEffect(() => {
    if (!editor) {
      setInsideTable(false);
      return;
    }

    const update = () => setInsideTable(editor.isActive("table"));
    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    editor.on("destroy", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      editor.off("destroy", update);
    };
  }, [editor]);

  if (!editor || !insideTable) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1">
      {actions.map(({ label, icon: Icon, command }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          title={label}
          className="inline-flex items-center justify-center rounded p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            editor.chain().focus()[command]().run();
          }}
        >
          <Icon aria-hidden="true" size={16} />
        </button>
      ))}
    </div>
  );
}
