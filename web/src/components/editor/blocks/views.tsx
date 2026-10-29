import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/i18n";

// Documented substitutions against the upstream source:
//
// 1. User-visible copy is rendered through `useT()` so the editor follows the app's language. Behaviour is unchanged;
//    only the label lookup differs from upstream.

const CALLOUT_EMOJIS = ["💡", "📌", "⚠️", "✅", "❗", "🎯", "🔥", "🌱", "📣", "💬", "🚀", "❤️"];

export function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const { t } = useT();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const emoji = typeof node.attrs.emoji === "string" ? node.attrs.emoji : "💡";
  return (
    <NodeViewWrapper className="my-3 flex gap-3 rounded-xl border border-border bg-muted/50 p-4" data-testid="callout-node" data-emoji={emoji}>
      <div className="relative shrink-0">
        <button
          type="button"
          className="rounded-md p-1 text-xl hover:bg-muted"
          aria-label={t("editor.chooseCalloutEmoji")}
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen((open) => !open)}
        >
          {emoji}
        </button>
        {paletteOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 grid grid-cols-6 gap-1 rounded-lg border border-border bg-background p-2 shadow-lg" role="group" aria-label={t("editor.calloutEmoji")}>
            {CALLOUT_EMOJIS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="rounded p-1 text-lg hover:bg-muted"
                aria-label={preset}
                onClick={() => {
                  updateAttributes({ emoji: preset });
                  setPaletteOpen(false);
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        )}
      </div>
      <NodeViewContent className="min-w-0 flex-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0" />
    </NodeViewWrapper>
  );
}

export function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const isOpen = node.attrs.open !== false;
  return (
    <NodeViewWrapper className="my-2 rounded-lg border border-border bg-background px-3 py-2" data-testid="toggle-node" data-open={String(isOpen)}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label={isOpen ? "Collapse toggle" : "Expand toggle"}
          onClick={() => updateAttributes({ open: !isOpen })}
        >
          {isOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        </button>
        <NodeViewContent className="min-w-0 flex-1" />
      </div>
    </NodeViewWrapper>
  );
}

function parentToggleOpen(editor: Editor, getPos: NodeViewProps["getPos"]): boolean {
  if (typeof getPos !== "function") return true;
  const position = getPos();
  if (typeof position !== "number") return true;
  return editor.state.doc.resolve(position).parent.attrs.open !== false;
}

export function ToggleSummaryView() {
  return <NodeViewWrapper className="min-h-7 py-1 font-medium"><NodeViewContent /></NodeViewWrapper>;
}

export function ToggleContentView({ editor, getPos }: NodeViewProps) {
  const [isOpen, setIsOpen] = useState(() => parentToggleOpen(editor, getPos));
  useEffect(() => {
    const update = () => setIsOpen(parentToggleOpen(editor, getPos));
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor, getPos]);
  return (
    <NodeViewWrapper className={isOpen ? "pl-7 pt-1" : "hidden"} data-testid="toggle-body">
      <NodeViewContent className="[&>p:first-child]:mt-0" />
    </NodeViewWrapper>
  );
}

type HeadingEntry = { level: number; text: string; position: number };

function collectHeadings(doc: ProseMirrorNode): HeadingEntry[] {
  const entries: HeadingEntry[] = [];
  doc.descendants((node, position) => {
    if (node.type.name !== "heading") return;
    const level = Number(node.attrs.level);
    if (level >= 1 && level <= 3) entries.push({ level, text: node.textContent, position });
  });
  return entries;
}

export function TableOfContentsView({ editor }: NodeViewProps) {
  const { t } = useT();
  const [headings, setHeadings] = useState(() => collectHeadings(editor.state.doc));
  useEffect(() => {
    const refresh = () => setHeadings(collectHeadings(editor.state.doc));
    editor.on("transaction", refresh);
    return () => {
      editor.off("transaction", refresh);
    };
  }, [editor]);

  return (
    <NodeViewWrapper className="my-3 rounded-lg border border-border bg-muted/30 p-3" data-table-of-contents="">
      {headings.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">No headings yet.</p>
      ) : (
        <nav aria-label={t("editor.tableOfContents")}>
          <ul className="m-0 list-none space-y-1 p-0">
            {headings.map((heading, index) => (
              <li key={`${heading.position}-${index}`}>
                <button
                  type="button"
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  style={{ paddingLeft: `${(heading.level - 1) * 16 + 8}px` }}
                  onClick={() => {
                    editor.chain().focus().setTextSelection(heading.position + 1).run();
                    const headingDOM = editor.view.nodeDOM(heading.position);
                    if (headingDOM instanceof HTMLElement) headingDOM.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </NodeViewWrapper>
  );
}
