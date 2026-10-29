import { useEffect, useId, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";

function countText(text: string, strippedText: string) {
  return {
    words: text.trim() ? text.trim().split(/\s+/u).length : 0,
    characters: strippedText.length,
  };
}

export function DocumentStats({ editor, className }: { editor: Editor | null; className?: string }) {
  const [text, setText] = useState(() => editor?.getText() ?? "");
  const [strippedText, setStrippedText] = useState(() => editor?.state.doc.textContent ?? "");

  useEffect(() => {
    if (!editor) {
      setText("");
      setStrippedText("");
      return;
    }

    const update = () => {
      setText(editor.getText());
      setStrippedText(editor.state.doc.textContent);
    };
    update();
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  if (!editor) return null;

  const { words, characters } = countText(text, strippedText);
  return <span className={className}>{words} words · {characters} characters</span>;
}

export interface UrlPromptProps {
  open: boolean;
  title: string;
  description: string;
  initialValue: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export function UrlPrompt({
  open,
  title,
  description,
  initialValue,
  confirmLabel,
  onCancel,
  onConfirm,
}: UrlPromptProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    inputRef.current?.focus();
    inputRef.current?.select();
    // The editor can take focus back while it finishes handling the key that opened this prompt,
    // so claim it once more on the next frame; without this a keyboard user types into the document.
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, initialValue]);

  if (!open) return null;

  const confirm = () => {
    if (!value.trim()) return;
    onConfirm(value);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="absolute z-50 w-80 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md"
    >
      <h2 id={titleId} className="text-sm font-medium">{title}</h2>
      <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">{description}</p>
      <input
        ref={inputRef}
        type="url"
        aria-label={`${title} URL`}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        onFocus={(event) => {
          // Selecting on focus covers the click-driven path, where the caller's mouse-up left the
          // initial value unselected and a pasted URL ended up appended to it.
          event.currentTarget.select();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            confirm();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        className="mt-3 w-full rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-sm hover:bg-accent">
          Cancel
        </button>
        <button type="button" onClick={confirm} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
