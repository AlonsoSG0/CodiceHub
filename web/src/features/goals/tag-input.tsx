import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchGoalVocabulary, type Tag } from "./goals-api";
import { useT } from "@/i18n";

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  vocabulary?: Tag[];
};

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names.map(normalizeTag).filter(Boolean))];
}

/** The shared tag vocabulary as chips on the open ground: no field box, no persistent label. */
export function TagInput({ value, onChange, vocabulary }: TagInputProps) {
  const { t } = useT();
  const [knownTags, setKnownTags] = useState<Tag[]>(vocabulary ?? []);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [draft]);

  useEffect(() => {
    if (vocabulary !== undefined) {
      setKnownTags(vocabulary);
      return;
    }

    let current = true;
    void fetchGoalVocabulary().then(
      ({ tags }) => {
        if (current) setKnownTags(tags);
      },
      () => {
        if (current) setKnownTags([]);
      },
    );
    return () => {
      current = false;
    };
  }, [vocabulary]);

  const suggestions = useMemo(() => {
    const query = normalizeTag(draft);
    if (!query) return [];
    const selected = new Set(value.map(normalizeTag));
    return knownTags.filter((tag) => tag.name.includes(query) && !selected.has(tag.name));
  }, [draft, knownTags, value]);

  const addTag = (rawName: string) => {
    const name = normalizeTag(rawName);
    if (!name) return;

    onChange(uniqueNames([...value, name]));
    setKnownTags((current) =>
      current.some(({ name: knownName }) => normalizeTag(knownName) === name)
        ? current
        : [...current, { id: name, name }],
    );
    setDraft("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const visibleSuggestions = open ? suggestions : [];

  return (
    <div className="relative flex min-w-0 flex-wrap items-center gap-1">
      {value.map((name) => (
        <span
          key={normalizeTag(name)}
          className="inline-flex h-6 items-center gap-0.5 rounded bg-muted pl-1.5 pr-0.5 text-[11px] text-foreground"
        >
          #{name}
          <Button
            type="button"
            variant="ghost"
            aria-label={t("goals.removeTag", { name })}
            onClick={() => onChange(value.filter((tag) => normalizeTag(tag) !== normalizeTag(name)))}
            className="size-5 shrink-0 rounded p-0 text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
          >
            <X size={11} aria-hidden="true" />
          </Button>
        </span>
      ))}

      <Input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-label={t("goals.tags")}
        aria-expanded={visibleSuggestions.length > 0}
        aria-controls={`${inputId}-suggestions`}
        aria-autocomplete="list"
        aria-activedescendant={visibleSuggestions.length === 0 ? undefined : `${inputId}-option-${activeIndex}`}
        placeholder={value.length === 0 ? t("goals.addTag") : t("goals.tagShort")}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          setOpen(next.trim() !== "");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && visibleSuggestions.length > 0) {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % visibleSuggestions.length);
          } else if (event.key === "ArrowUp" && visibleSuggestions.length > 0) {
            event.preventDefault();
            setActiveIndex((current) => (current - 1 + visibleSuggestions.length) % visibleSuggestions.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const picked = visibleSuggestions[activeIndex];
            addTag(picked === undefined ? draft : picked.name);
          } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
            event.preventDefault();
            onChange(value.slice(0, -1));
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        onFocus={() => {
          if (draft.trim() !== "") setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        className="h-6 min-w-[5.5rem] flex-1 border-0 bg-transparent px-1 text-[11px] shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      {visibleSuggestions.length > 0 ? (
        <ul
          id={`${inputId}-suggestions`}
          role="listbox"
          aria-label={t("goals.tagSuggestions")}
          className="absolute left-0 top-full z-50 mt-1 max-h-52 w-[14rem] overflow-y-auto rounded-md border border-border bg-popover p-1"
        >
          {visibleSuggestions.map((tag, index) => (
            <li
              key={tag.id}
              id={`${inputId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                addTag(tag.name);
              }}
              onClick={() => addTag(tag.name)}
              className={cn(
                "flex min-h-8 w-full cursor-pointer items-center rounded-sm px-2 text-left text-xs text-foreground",
                "transition-colors duration-150 motion-reduce:transition-none",
                index === activeIndex ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              #{tag.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
