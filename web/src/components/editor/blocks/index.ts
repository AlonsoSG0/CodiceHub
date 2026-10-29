import { Node } from "@tiptap/core";
import type { SlashCommandSuggestionItem } from "@/components/block-editor";
import { createElement } from "react";
import { List, PanelTop, Rows3 } from "lucide-react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CalloutView, TableOfContentsView, ToggleContentView, ToggleSummaryView, ToggleView } from "./views";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  addAttributes() {
    return {
      emoji: {
        default: "💡",
        parseHTML: (element) => element.getAttribute("data-emoji") ?? "💡",
        renderHTML: (attributes) => ({ "data-emoji": attributes.emoji }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-callout": "" }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

export const ToggleSummary = Node.create({
  name: "toggleSummary",
  content: "inline*",
  parseHTML() {
    return [{ tag: "div[data-toggle-summary]" }];
  },
  renderHTML() {
    return ["div", { "data-toggle-summary": "" }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ToggleSummaryView);
  },
});

export const ToggleContent = Node.create({
  name: "toggleContent",
  content: "block+",
  parseHTML() {
    return [{ tag: "div[data-toggle-content]" }];
  },
  renderHTML() {
    return ["div", { "data-toggle-content": "" }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ToggleContentView);
  },
});

export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "toggleSummary toggleContent",
  addExtensions() {
    return [ToggleSummary, ToggleContent];
  },
  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-open") !== "false",
        renderHTML: (attributes) => ({ "data-open": String(attributes.open !== false) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-toggle]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-toggle": "" }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});

export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  parseHTML() {
    return [{ tag: "div[data-table-of-contents]" }];
  },
  renderHTML() {
    return ["div", { "data-table-of-contents": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsView);
  },
});

export function createCalloutSlashItem(): SlashCommandSuggestionItem {
  return {
    id: "callout",
    title: "Callout",
    description: "Add a highlighted callout block.",
    icon: createElement(PanelTop, { size: 16 }),
    keywords: ["callout", "highlight", "emoji"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertContent({ type: "callout", content: [{ type: "paragraph" }] }).run(),
  };
}

export function createToggleSlashItem(): SlashCommandSuggestionItem {
  return {
    id: "toggle",
    title: "Toggle",
    description: "Add a collapsible block.",
    icon: createElement(List, { size: 16 }),
    keywords: ["toggle", "collapse", "expand"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertContent({ type: "toggle", content: [{ type: "toggleSummary" }, { type: "toggleContent", content: [{ type: "paragraph" }] }] }).run(),
  };
}

export function createTableOfContentsSlashItem(): SlashCommandSuggestionItem {
  return {
    id: "table-of-contents",
    title: "Table of contents",
    description: "Show the page headings in a table of contents.",
    icon: createElement(Rows3, { size: 16 }),
    keywords: ["table", "contents", "headings", "outline"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertContent({ type: "tableOfContents" }).run(),
  };
}
