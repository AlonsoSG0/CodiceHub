import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { Extension } from "@tiptap/core";
import type { Editor, JSONContent } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { Star } from "lucide-react";
import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  BlockEditor,
  CodeBlock,
  DEFAULT_ICONS,
  getSlashCommandSuggestion,
  SlashCommand,
  type SlashCommandSuggestionItem,
} from "@/components/block-editor";
import {
  createTwitterSlashItem,
  createYouTubeSlashItem,
  TwitterEmbed,
  YouTubeEmbed,
} from "@/components/editor/embeds";
import {
  Callout,
  createCalloutSlashItem,
  createTableOfContentsSlashItem,
  createToggleSlashItem,
  TableOfContents,
  Toggle,
  ToggleContent,
  ToggleSummary,
} from "@/components/editor/blocks";
import { createMentionTrigger, createPageMention, createPageSlashItem } from "@/components/editor/mentions";
import { createTableSlashItem, TableControls } from "@/components/editor/table";
import { UrlPrompt } from "@/components/editor/extras";

type UploadImage = (file: File) => Promise<string>;
type ImageTransfer = Pick<DataTransfer, "items" | "files">;

export interface NoteEditorProps {
  value: JSONContent;
  onChange: (value: JSONContent) => void;
  placeholder?: string;
  className?: string;
  uploadImage?: UploadImage;
  onEditorReady?: (editor: Editor | null) => void;
  pageId?: string;
  pages?: { id: string; title: string }[];
  onCreateSubpage?: (parentId: string | null) => Promise<{ id: string; title: string }>;
}

const DEFAULT_PLACEHOLDER = "Start writing, or type / for a command…";

const STAR_SLASH_ITEM: SlashCommandSuggestionItem = {
  id: "star",
  title: "Star",
  description: "Insert a star character.",
  icon: <Star size={16} />,
  keywords: ["star", "emoji", "favorite"],
  command: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).insertContent("⭐").run();
  },
};

type UrlPromptKind = "link" | "image";

function createImageFromUrlSlashItem(openPrompt: () => void): SlashCommandSuggestionItem {
  return {
    id: "image-url",
    title: "Picture from URL",
    description: "Insert an image from a link.",
    icon: DEFAULT_ICONS.slashImageIcon,
    keywords: ["image", "url", "link", "photo", "picture"],
    command: ({ editor: current, range }) => {
      current.chain().focus().deleteRange(range).run();
      openPrompt();
    },
  };
}

function createShortcutExtension(openUrlPrompt: (kind: UrlPromptKind) => void) {
  return Extension.create({
    name: "editorShortcuts",
    addKeyboardShortcuts() {
      return {
        "Mod-Shift-h": () => this.editor.chain().focus().toggleHighlight().run(),
        "Mod-Shift-k": () => {
          if (this.editor.state.selection.empty) return false;
          if (this.editor.isActive("link")) return this.editor.chain().focus().unsetLink().run();
          openUrlPrompt("link");
          return true;
        },
      };
    },
  });
}

function getImageFile(transfer: ImageTransfer | null): File | null {
  if (!transfer) return null;
  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return Array.from(transfer.files ?? []).find((file) => file.type.startsWith("image/")) ?? null;
}

function insertUploadedImage(
  editor: Editor,
  position: number,
  file: File,
  uploadImage: UploadImage,
  clearError: () => void,
  reportError: (error: unknown) => void,
): void {
  clearError();
  void Promise.resolve()
    .then(() => uploadImage(file))
    .then((url) => {
      if (typeof url !== "string" || url.length === 0) throw new Error("invalid_upload_response");
      if (editor.isDestroyed) return;
      editor.chain().focus().insertContentAt(position, { type: "image", attrs: { src: url } }).run();
    })
    .catch(reportError);
}

function createImageUploadExtension(
  uploadImage: UploadImage,
  clearError: () => void,
  reportError: (error: unknown) => void,
) {
  return Extension.create({
    name: "imageUpload",
    addProseMirrorPlugins() {
      const editor = this.editor;
      const uploadFromEvent = (view: EditorView, event: ClipboardEvent | DragEvent, transfer: DataTransfer | null) => {
        const file = getImageFile(transfer);
        if (!file) return false;
        event.preventDefault();
        insertUploadedImage(editor, view.state.selection.from, file, uploadImage, clearError, reportError);
        return true;
      };

      return [
        new Plugin({
          props: {
            handlePaste(view, event) {
              return uploadFromEvent(view, event, event.clipboardData);
            },
            handleDOMEvents: {
              drop(view, event) {
                return uploadFromEvent(view, event as DragEvent, (event as DragEvent).dataTransfer);
              },
            },
          },
        }),
      ];
    },
  });
}

function uploadErrorMessage(error: unknown): string {
  return `Image upload failed: ${error instanceof Error ? error.message : "upload_failed"}`;
}

export function NoteEditor({
  value,
  onChange,
  placeholder = DEFAULT_PLACEHOLDER,
  className,
  uploadImage,
  onEditorReady,
  pageId,
  pages,
  onCreateSubpage,
}: NoteEditorProps) {
  const onChangeRef = useRef(onChange);
  const lastEmittedRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slashPositionRef = useRef<{ editor: Editor; position: number } | null>(null);
  const pagesRef = useRef(pages);
  const createSubpageRef = useRef(onCreateSubpage);
  const linkRangeRef = useRef<{ from: number; to: number } | null>(null);
  const openUrlPromptRef = useRef<((kind: UrlPromptKind) => void) | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [urlPrompt, setUrlPrompt] = useState<UrlPromptKind | null>(null);
  onChangeRef.current = onChange;
  pagesRef.current = pages;
  createSubpageRef.current = onCreateSubpage;

  const extensions = useMemo(() => {
    const imageCommand = uploadImage
      ? [
          {
            command: ({ editor, range }: { editor: Editor; range: { from: number; to: number } }) => {
              editor.chain().focus().deleteRange(range).run();
              slashPositionRef.current = { editor, position: editor.state.selection.from };
              fileInputRef.current?.click();
            },
            description: "Upload an image from your device.",
            icon: DEFAULT_ICONS.slashImageIcon,
            id: "image",
            keywords: ["image", "photo", "picture"],
            title: "Image",
          },
        ]
      : undefined;
    const slashItems = [
      ...(imageCommand ?? []),
      STAR_SLASH_ITEM,
      createYouTubeSlashItem(),
      createTwitterSlashItem(),
      createCalloutSlashItem(),
      createToggleSlashItem(),
      createTableOfContentsSlashItem(),
      createTableSlashItem(),
      createImageFromUrlSlashItem(() => openUrlPromptRef.current?.("image")),
      ...(onCreateSubpage
        ? [
            createPageSlashItem({
              parentId: pageId ?? null,
              onCreateSubpage: (parentId) => createSubpageRef.current!(parentId),
            }),
          ]
        : []),
    ];

    return [
      StarterKit.configure({ codeBlock: false, link: false, underline: false }),
      CodeBlock,
      Placeholder.configure({ placeholder, showOnlyCurrent: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      YouTubeEmbed,
      TwitterEmbed,
      Callout,
      Toggle,
      ToggleSummary,
      ToggleContent,
      TableOfContents,
      createPageMention({ resolveTitle: (id) => pagesRef.current?.find((page) => page.id === id)?.title ?? null }),
      createMentionTrigger({ getPages: () => pagesRef.current ?? [] }),
      createShortcutExtension((kind) => openUrlPromptRef.current?.(kind)),
      ...(uploadImage ? [createImageUploadExtension(uploadImage, () => setUploadError(null), (error) => setUploadError(uploadErrorMessage(error)))] : []),
      SlashCommand.configure({ suggestion: getSlashCommandSuggestion(slashItems) }),
    ];
  }, [placeholder, uploadImage]);

  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Page content",
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const nextContent = updatedEditor.getJSON();
      lastEmittedRef.current = JSON.stringify(nextContent);
      onChangeRef.current(nextContent);
    },
  });

  openUrlPromptRef.current = (kind) => {
    if (!editor) return;
    if (kind === "link") {
      const { from, to, empty } = editor.state.selection;
      if (empty) return;
      linkRangeRef.current = { from, to };
    }
    setUrlPrompt(kind);
  };

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(value);
    if (incoming === lastEmittedRef.current) return;
    if (JSON.stringify(editor.getJSON()) === incoming) return;
    // The mount-time normalization and any external replacement are not user edits, so they
    // must not create an undo step: a fresh page starts with both controls disabled.
    editor
      .chain()
      .command(({ tr }) => {
        tr.setMeta("addToHistory", false);
        return true;
      })
      .setContent(value, { emitUpdate: false })
      .run();
  }, [editor, value]);

  const handleSlashFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    const pending = slashPositionRef.current;
    slashPositionRef.current = null;
    event.currentTarget.value = "";
    if (!file || !pending || !uploadImage) return;
    insertUploadedImage(pending.editor, pending.position, file, uploadImage, () => setUploadError(null), (error) => setUploadError(uploadErrorMessage(error)));
  };

  const confirmUrl = (raw: string) => {
    const url = raw.trim();
    if (!editor || !url) return;
    if (urlPrompt === "link") {
      const range = linkRangeRef.current;
      const chain = editor.chain().focus();
      if (range) chain.setTextSelection(range);
      chain.setLink({ href: url }).run();
    } else if (urlPrompt === "image") {
      editor.chain().focus().setImage({ src: url }).run();
    }
    linkRangeRef.current = null;
    setUrlPrompt(null);
  };

  return (
    <>
      {uploadImage && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          aria-hidden="true"
          tabIndex={-1}
          hidden
          onChange={handleSlashFile}
        />
      )}
      {uploadError && <p role="alert">{uploadError}</p>}
      <TableControls editor={editor} />
      <BlockEditor editor={editor} className={className} />
      <UrlPrompt
        open={urlPrompt !== null}
        title={urlPrompt === "link" ? "Add link" : "Image from URL"}
        description={
          urlPrompt === "link"
            ? "Paste the address the selected text should point to."
            : "Paste the address of the image to insert."
        }
        initialValue="https://"
        confirmLabel={urlPrompt === "link" ? "Add link" : "Insert image"}
        onCancel={() => {
          linkRangeRef.current = null;
          setUrlPrompt(null);
        }}
        onConfirm={confirmUrl}
      />
    </>
  );
}
