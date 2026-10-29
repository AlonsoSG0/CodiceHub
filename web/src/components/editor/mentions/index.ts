import { Extension, Node } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Suggestion } from "@tiptap/suggestion";
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { FilePlus2 } from "lucide-react";
import { createElement, forwardRef, useImperativeHandle, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useNavigate } from "react-router-dom";

export interface PageMentionOptions {
  resolveTitle: (pageId: string) => string | null;
}

function PageMentionView({ node, extension }: NodeViewProps) {
  const pageId = String(node.attrs.pageId ?? "");
  const { resolveTitle } = extension.options as PageMentionOptions;
  const title = resolveTitle(pageId) ?? "Untitled page";
  const navigate = useNavigate();
  const href = `/notes/${encodeURIComponent(pageId)}`;

  return createElement(
    NodeViewWrapper,
    { className: "page-mention", "data-page-id": pageId },
    createElement("a", {
      className: "inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-sm text-primary underline-offset-2 hover:underline",
      href,
      contentEditable: false,
      "data-page-mention": "",
      onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => {
        // The link is real, so a modified click still opens a tab or copies the address; a plain click routes.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(href);
      },
    }, title),
  );
}

export function createPageMention(options: PageMentionOptions) {
  return Node.create({
    name: "pageMention",
    inline: true,
    atom: true,
    group: "inline",
    addAttributes() {
      return {
        pageId: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-page-id") ?? "",
          renderHTML: (attributes: { pageId?: string }) => ({ "data-page-id": attributes.pageId ?? "" }),
        },
      };
    },
    parseHTML() {
      return [{ tag: "span[data-page-mention]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["span", { ...HTMLAttributes, "data-page-mention": "" }];
    },
    addNodeView() {
      return ReactNodeViewRenderer(PageMentionView);
    },
    addOptions() {
      return options;
    },
  });
}

interface PageItem {
  id: string;
  title: string;
}

interface MentionListProps extends SuggestionProps<PageItem> {}

interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const MentionList = forwardRef<MentionListHandle, MentionListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const select = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((index) => (index + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((index) => (index + 1) % props.items.length);
        return true;
      }
      if (event.key === "Enter") {
        select(selectedIndex);
        return true;
      }
      if (event.key === "Escape") return true;
      return false;
    },
  }), [props.items, selectedIndex]);

  return createElement(
    "div",
    { role: "listbox", "aria-label": "Pages", className: "absolute z-50 min-w-48 rounded-md border bg-popover p-1 shadow-md" },
    ...props.items.map((page, index) => createElement(
      "button",
      {
        key: page.id,
        type: "button",
        role: "option",
        "aria-selected": index === selectedIndex,
        className: "block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted",
        onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
        onClick: () => select(index),
      },
      page.title || "Untitled page",
    )),
    ...(props.items.length === 0 ? [createElement("div", { key: "empty", className: "px-2 py-1 text-sm text-muted-foreground" }, "No pages found")] : []),
  );
});
MentionList.displayName = "MentionList";

export function createMentionTrigger(options: { getPages: () => PageItem[] }) {
  return Extension.create({
    name: "pageMentionTrigger",
    addProseMirrorPlugins() {
      let component: ReactRenderer<MentionListHandle> | undefined;
      const positionList = (props: SuggestionProps<PageItem>) => {
        const rect = props.clientRect?.();
        if (!rect || !component?.element) return;
        component.element.style.position = "absolute";
        component.element.style.left = `${rect.left + window.scrollX}px`;
        component.element.style.top = `${rect.bottom + window.scrollY}px`;
      };
      const suggestion: Omit<SuggestionOptions<PageItem>, "editor"> = {
        char: "@",
        // With no page list to offer, the trigger stays silent instead of opening an empty list.
        allow: () => options.getPages().length > 0,
        items: ({ query }) => options.getPages()
          .filter((page) => page.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
          .slice(0, 8),
        command: ({ editor, range, props: page }) => {
          editor.chain().focus().deleteRange(range).insertContent({
            type: "pageMention",
            attrs: { pageId: page.id },
          }).run();
        },
        render: () => ({
          onStart: (props) => {
            component = new ReactRenderer(MentionList, { editor: props.editor, props });
            if (component.element instanceof HTMLElement) document.body.append(component.element);
            positionList(props);
          },
          onUpdate: (props) => {
            component?.updateProps(props);
            positionList(props);
          },
          onKeyDown: (props) => component?.ref?.onKeyDown(props) ?? false,
          onExit: () => {
            component?.element.remove();
            component?.destroy();
            component = undefined;
          },
        }),
      };
      return [Suggestion({ editor: this.editor, ...suggestion })];
    },
  });
}

export interface PageSlashItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  keywords: string[];
  command: (props: { editor: Editor; range: Range }) => Promise<void>;
}

export function createPageSlashItem(options: {
  parentId: string | null;
  onCreateSubpage: (parentId: string | null) => Promise<PageItem>;
}): PageSlashItem {
  return {
    id: "page",
    title: "Page",
    description: "Create a linked subpage.",
    icon: createElement(FilePlus2, { size: 16 }),
    keywords: ["page", "subpage", "child"],
    async command({ editor, range }) {
      try {
        const page = await options.onCreateSubpage(options.parentId);
        editor.chain().focus().deleteRange(range).insertContent({
          type: "pageMention",
          attrs: { pageId: page.id },
        }).run();
      } catch {
        // A failed create leaves the document unchanged.
      }
    },
  };
}
