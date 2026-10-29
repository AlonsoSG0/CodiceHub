import { useEffect, useRef, useState } from "react";
import { Check, Smile, X } from "lucide-react";
import type { RefObject } from "react";
import { PAGE_ICON_NAMES, PageIcon } from "./page-icon.js";
import { useT } from "@/i18n";

type EmojiNamespace = typeof import("frimousse");
type EmojiData = Awaited<ReturnType<EmojiNamespace["defaultEmojiDataResolver"]>>;
type EmojiParts = EmojiNamespace["EmojiPicker"];

export function PageIconPicker({
  currentIcon,
  titleInputRef,
  onSave,
}: {
  currentIcon: string | null;
  titleInputRef: RefObject<HTMLInputElement | null>;
  onSave: (icon: string | null) => Promise<void>;
}) {
  const { t, language } = useT();
  const [open, setOpen] = useState(false);
  const [emojiParts, setEmojiParts] = useState<EmojiParts | null>(null);
  const [emojiData, setEmojiData] = useState<EmojiData | null>(null);
  const [emojiError, setEmojiError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [emojiSectionOpen, setEmojiSectionOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const openEmojiSection = async () => {
    setEmojiSectionOpen(true);
    setEmojiError(false);
    if (emojiParts && emojiData) return;
    try {
      const module = await import("frimousse");
      const data = await module.defaultEmojiDataResolver(language, {});
      setEmojiParts(module.EmojiPicker);
      setEmojiData(data);
    } catch {
      setEmojiError(true);
    }
  };

  const { Root: EmojiRoot, Search: EmojiSearch, Viewport: EmojiViewport, List: EmojiList } = emojiParts ?? {};

  const save = async (icon: string | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(icon);
      setOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("notes.saveIconError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        aria-label={t("notes.changePageIcon")}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) requestAnimationFrame(() => titleInputRef.current?.focus());
        }}
        className="inline-flex size-14 shrink-0 items-center justify-center rounded-md hover:bg-muted"
      >
        <PageIcon icon={currentIcon} className="size-11" />
      </button>
      {open ? (
        <div
          ref={pickerRef}
          role="dialog"
          aria-label={t("notes.choosePageIcon")}
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">{t("notes.chooseIcon")}</span>
            <button type="button" aria-label={t("notes.closeIconPicker")} onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1" aria-label={t("notes.iconPalette")}>
            {PAGE_ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={t(`notes.icon.${name}`)}
                title={t(`notes.icon.${name}`)}
                disabled={saving}
                onClick={() => void save(name)}
                className="flex size-9 items-center justify-center rounded hover:bg-muted"
              >
                <PageIcon icon={name} className="size-5" />
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <button type="button" aria-label={t("notes.openEmojiPicker")} onClick={() => void openEmojiSection()} className="flex items-center gap-2 text-sm hover:text-foreground">
              <Smile size={16} /> {t("notes.emojis")}
            </button>
            {emojiSectionOpen ? (
              <div className="mt-2">
                {emojiError ? (
                  <p role="status" className="text-sm text-muted-foreground">{t("notes.emojisUnavailable")}</p>
                ) : EmojiRoot && EmojiSearch && EmojiViewport && EmojiList && emojiData ? (
                  // frimousse is headless: Root holds the data and the selection, and the list only
                  // renders when it is composed inside a Viewport. Rendering Root alone shows nothing.
                  <EmojiRoot
                    locale={language}
                    onEmojiSelect={({ emoji }: { emoji: string }) => void save(`emoji:${emoji}`)}
                    resolveEmojiData={() => emojiData}
                  >
                    <EmojiSearch
                      aria-label={t("notes.searchEmojis")}
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                    />
                    <EmojiViewport className="mt-2 h-48 overflow-y-auto">
                      <EmojiList className="flex flex-wrap gap-0.5" />
                    </EmojiViewport>
                  </EmojiRoot>
                ) : (
                  <p role="status" className="text-sm text-muted-foreground">{t("notes.loadingEmojis")}</p>
                )}
              </div>
            ) : null}
          </div>
          {currentIcon && currentIcon !== "notebook-text" ? (
            <button type="button" disabled={saving} onClick={() => void save(null)} className="mt-3 flex w-full items-center gap-2 border-t border-border pt-3 text-sm hover:text-foreground">
              <Check size={16} /> {t("notes.removeIcon")}
            </button>
          ) : null}
          {saveError ? <p role="alert" className="mt-2 text-sm text-destructive">{saveError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
