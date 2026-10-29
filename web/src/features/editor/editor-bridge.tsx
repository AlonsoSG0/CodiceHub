import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

type EditorBridgeValue = {
  editor: Editor | null;
  publishEditor: (editor: Editor | null) => void;
};

const EditorBridgeContext = createContext<EditorBridgeValue>({
  editor: null,
  publishEditor: () => undefined,
});

export function EditorBridgeProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const publishEditor = useCallback((nextEditor: Editor | null) => setEditor(nextEditor), []);

  return (
    <EditorBridgeContext.Provider value={{ editor, publishEditor }}>
      {children}
    </EditorBridgeContext.Provider>
  );
}

export function usePublishEditor() {
  return useContext(EditorBridgeContext).publishEditor;
}

export function useActiveEditor() {
  return useContext(EditorBridgeContext).editor;
}

export function EditorHistoryControls() {
  const { t } = useT();
  const { editor } = useContext(EditorBridgeContext);
  const [, refresh] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const update = () => refresh((current) => current + 1);
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  const activeEditor = editor && !editor.isDestroyed ? editor : null;
  // Undo/Redo belong to the document being edited: on a list, the trash or any other section they are dead chrome.
  if (!activeEditor) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("editor.undo")}
        title={t("editor.undo")}
        disabled={!activeEditor.can().undo()}
        onClick={() => activeEditor.commands.undo()}
      >
        <Undo2 size={15} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("editor.redo")}
        title={t("editor.redo")}
        disabled={!activeEditor.can().redo()}
        onClick={() => activeEditor.commands.redo()}
      >
        <Redo2 size={15} aria-hidden="true" />
      </Button>
    </>
  );
}
