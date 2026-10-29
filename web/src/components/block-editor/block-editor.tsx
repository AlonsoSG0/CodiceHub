// Documented substitutions against the upstream source:
//
// 1. User-visible copy is rendered through `useT()` from the app message catalogues. Behaviour is unchanged; only the label lookup differs.

import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Node } from "@tiptap/pm/model";
import { EditorContent } from "@tiptap/react";
import { Plus } from "lucide-react";
import { useCallback, useRef } from "react";

import { BottomBar } from "./bottom-bar";
import { BubbleMenu } from "./bubble-menu";
import { BlockEditorProvider, useBlockEditorContext } from "./context";
import { cn } from "./lib/utils";
import { useT } from "@/i18n";
import type { BlockEditorProps } from "./types";

const computePositionConfig = {
  placement: "left-start",
  strategy: "absolute",
} as const;

const BlockEditorDragHandle = () => {
  const { editor, icons } = useBlockEditorContext();
  const { t } = useT();
  const dragNodeRef = useRef<{ node: Node; pos: number } | null>(null);

  const handleNodeChange = useCallback(
    ({ node, pos }: { node: Node | null; pos: number }) => {
      dragNodeRef.current = node ? { node, pos } : null;
    },
    []
  );

  const handleAdd = useCallback(() => {
    const dragNode = dragNodeRef.current;
    if (!dragNode || !editor || editor.isDestroyed) {
      return;
    }

    const { node, pos } = dragNode;
    if (node.type.spec.code || node.isLeaf) {
      return;
    }

    editor
      .chain()
      .focus(pos + 1)
      .insertContent("/")
      .run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <DragHandle
      computePositionConfig={computePositionConfig}
      editor={editor}
      onNodeChange={handleNodeChange}
    >
      <button
        type="button"
        aria-label={t("editor.addBlock")}
        className="block-editor-add-block"
        onClick={handleAdd}
        onDragStart={(event) => event.preventDefault()}
      >
        <Plus />
      </button>
      {icons.dragHandleIcon}
    </DragHandle>
  );
};

const BlockEditorContent = () => {
  const { editor } = useBlockEditorContext();

  return (
    <div className="block-editor">
      {editor && editor.isEditable && <BlockEditorDragHandle />}
      {editor && editor.isEditable && <BubbleMenu editor={editor} />}
      <EditorContent editor={editor} className="block-editor-content" />
      {editor && editor.isEditable && <BottomBar editor={editor} />}
    </div>
  );
};

const BlockEditorRoot = ({
  editor,
  children,
  className,
  labels,
  icons,
}: BlockEditorProps) => (
  <BlockEditorProvider editor={editor} labels={labels} icons={icons}>
    <div className={cn("block-editor", className)}>
      {children ?? <BlockEditorContent />}
    </div>
  </BlockEditorProvider>
);

export const BlockEditor = Object.assign(BlockEditorRoot, {
  BottomBar,
  BubbleMenu,
  Content: BlockEditorContent,
});
