import { Archive, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { DEFAULT_HABIT_ICON, HabitIcon, habitIconOptions } from "./habit-icon";
import type { Habit, HabitFieldInput, HabitFieldKind, HabitFieldPatch } from "./habits-api";

type HabitEditorProps = {
  habit: Habit;
  managedByBooks?: boolean;
  onRename: (name: string) => Promise<unknown>;
  onUpdateIcon: (icon: string) => Promise<unknown>;
  onAddField: (input: HabitFieldInput) => Promise<unknown>;
  onUpdateField: (fieldId: string, patch: HabitFieldPatch) => Promise<unknown>;
  onRemoveField: (fieldId: string) => Promise<unknown>;
  onArchive: () => Promise<unknown>;
  onClose: () => void;
};

const inputClassName = "h-11 min-w-0 bg-background text-sm";

export function HabitEditor({
  habit,
  managedByBooks = false,
  onRename,
  onUpdateIcon,
  onAddField,
  onUpdateField,
  onRemoveField,
  onArchive,
  onClose,
}: HabitEditorProps) {
  const { locale, t } = useT();
  const [name, setName] = useState(habit.name);
  const [icon, setIcon] = useState(habit.icon ?? DEFAULT_HABIT_ICON);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, { label: string; unit: string; target: string }>>(() =>
    Object.fromEntries(
      habit.fields.map((field) => [field.id, { label: field.label, unit: field.unit ?? "", target: field.target === null ? "" : String(field.target) }]),
    ),
  );
  const [kind, setKind] = useState<HabitFieldKind>("check");
  const [newLabel, setNewLabel] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [alert, setAlert] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setName(habit.name);
    setIcon(habit.icon ?? DEFAULT_HABIT_ICON);
  }, [habit.id, habit.name, habit.icon]);

  async function write(callback: () => Promise<unknown>) {
    setAlert(null);
    setStatus(null);
    try {
      await callback();
    } catch (error) {
      setAlert(error instanceof Error ? error.message : t("habits.couldNotSave"));
    }
  }

  function commitOnEnter(event: React.KeyboardEvent<HTMLInputElement>, commit: () => void) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  }

  function commitName() {
    if (!managedByBooks && name !== habit.name) void write(() => onRename(name));
  }

  function draftFor(field: Habit["fields"][number]) {
    return fieldDrafts[field.id] ?? { label: field.label, unit: field.unit ?? "", target: field.target === null ? "" : String(field.target) };
  }

  function updateDraft(fieldId: string, key: "label" | "unit" | "target", value: string) {
    setFieldDrafts((current) => ({
      ...current,
      [fieldId]: { ...current[fieldId], [key]: value },
    }));
  }

  function commitField(field: Habit["fields"][number], key: "label" | "unit" | "target") {
    const draft = draftFor(field);
    if (key === "label" && draft.label !== field.label) void write(() => onUpdateField(field.id, { label: draft.label }));
    if (key === "unit" && draft.unit !== (field.unit ?? "")) {
      void write(() => onUpdateField(field.id, { unit: draft.unit || null }));
    }
    if (key === "target" && draft.target !== (field.target === null ? "" : String(field.target))) {
      const target = draft.target.trim() === "" ? null : Number(draft.target);
      if (target === null || Number.isFinite(target)) void write(() => onUpdateField(field.id, { target }));
    }
  }

  function addField() {
    const input: HabitFieldInput = { kind, label: newLabel.trim() || undefined };
    if (kind === "number") {
      input.unit = newUnit.trim() || null;
      input.target = newTarget.trim() === "" ? null : Number(newTarget);
      if (input.target !== null && !Number.isFinite(input.target)) return;
    }
    void write(async () => {
      await onAddField(input);
      setNewLabel("");
      setNewUnit("");
      setNewTarget("");
    });
  }

  function removeField(field: Habit["fields"][number]) {
    void write(async () => {
      const result = await onRemoveField(field.id);
      const outcome = typeof result === "string" ? result : typeof result === "object" && result !== null && "field" in result ? result.field : "deleted";
      const kindLabel = t(field.kind === "check" ? "habits.check" : field.kind === "number" ? "habits.number" : "habits.text");
      const fieldName = field.label || kindLabel;
      setStatus(outcome === "archived" ? t("habits.archivedStatus", { name: fieldName }) : t("habits.removedStatus", { name: fieldName }));
    });
  }

  return (
    <div className="space-y-5 text-foreground">
      {alert && (
        <p role="alert" aria-live="assertive" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {alert}
        </p>
      )}
      {status ? <p role="status" className="text-sm text-muted-foreground">{status}</p> : null}

      <section aria-labelledby="habit-identity-heading" className="space-y-3">
        <h3 id="habit-identity-heading" className="text-sm font-semibold">{t("habits.identity")}</h3>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.7fr)]">
          <label className="grid gap-1.5 text-sm font-medium">
            {t("habits.name")}
            <Input aria-label={t("habits.name")} readOnly={managedByBooks} className={cn(inputClassName, "w-full")} value={name} onChange={(event) => setName(event.target.value)} onBlur={commitName} onKeyDown={(event) => commitOnEnter(event, commitName)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t("habits.icon")}
            <Select value={icon} onValueChange={(value) => {
              if (!value || value === icon) return;
              void write(async () => {
                await onUpdateIcon(value);
                setIcon(value);
              });
            }}>
              <SelectTrigger aria-label={t("habits.icon")} className="h-11 w-full"><HabitIcon name={icon} className="size-4" /><SelectValue /></SelectTrigger>
              <SelectContent>
                {habitIconOptions.map((option) => <SelectItem key={option.value} value={option.value} className="min-h-11"><HabitIcon name={option.value} className="size-4" />{t(option.label)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </div>
        {managedByBooks ? <p className="text-sm text-muted-foreground">{t("habits.managedByBooks")}</p> : null}
      </section>

      <section aria-labelledby="habit-fields-heading" className="space-y-2">
        <h3 id="habit-fields-heading" className="text-sm font-semibold">{t("habits.fieldsHeading")}</h3>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {[...habit.fields].filter((field) => field.archivedAt === null).sort((a, b) => a.position - b.position).map((field) => {
            const draft = draftFor(field);
            const commit = (key: "label" | "unit" | "target") => () => commitField(field, key);
            return (
              <li key={field.id} className="flex flex-wrap items-end gap-2 p-3">
                <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{t(field.kind === "check" ? "habits.check" : field.kind === "number" ? "habits.number" : "habits.text").toLocaleLowerCase(locale)}</span>
                <label className="grid min-w-[10rem] flex-1 gap-1 text-xs text-muted-foreground">
                  {t("habits.label")}
                  <Input aria-label={`${field.label || t(field.kind === "check" ? "habits.check" : field.kind === "number" ? "habits.number" : "habits.text")} ${t("habits.label").toLocaleLowerCase(locale)}`} className={inputClassName} value={draft.label} onChange={(event) => updateDraft(field.id, "label", event.target.value)} onBlur={commit("label")} onKeyDown={(event) => commitOnEnter(event, commit("label"))} />
                </label>
                {field.kind === "number" && (
                  <>
                    <label className="grid w-24 gap-1 text-xs text-muted-foreground">{t("habits.unit")}
                      <Input aria-label={`${field.label || t("habits.fieldFallback")} ${t("habits.unit").toLocaleLowerCase(locale)}`} className={inputClassName} value={draft.unit} onChange={(event) => updateDraft(field.id, "unit", event.target.value)} onBlur={commit("unit")} onKeyDown={(event) => commitOnEnter(event, commit("unit"))} />
                    </label>
                    <label className="grid w-24 gap-1 text-xs text-muted-foreground">{t("habits.target")}
                      <Input type="number" aria-label={`${field.label || t("habits.fieldFallback")} ${t("habits.target").toLocaleLowerCase(locale)}`} className={inputClassName} value={draft.target} onChange={(event) => updateDraft(field.id, "target", event.target.value)} onBlur={commit("target")} onKeyDown={(event) => commitOnEnter(event, commit("target"))} />
                    </label>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("habits.removeField", { name: field.label || t(field.kind === "check" ? "habits.check" : field.kind === "number" ? "habits.number" : "habits.text") })}
                  onClick={() => removeField(field)}
                  className="size-11 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="habit-add-field-heading" className="space-y-3 rounded-lg border border-border p-3">
        <h3 id="habit-add-field-heading" className="text-sm font-semibold">{t("habits.addField")}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={kind} onValueChange={(value) => value && setKind(value as HabitFieldKind)}>
            <SelectTrigger aria-label={t("habits.fieldKind")} className="h-11 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="check" className="min-h-11">{t("habits.check")}</SelectItem>
              <SelectItem value="number" className="min-h-11">{t("habits.number")}</SelectItem>
              <SelectItem value="text" className="min-h-11">{t("habits.text")}</SelectItem>
            </SelectContent>
          </Select>
          <label className="grid min-w-[10rem] flex-1 gap-1 text-xs text-muted-foreground">{t("habits.label")}
            <Input aria-label={t("habits.newFieldLabel")} className={inputClassName} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
          </label>
          {kind === "number" && (
            <>
              <label className="grid w-24 gap-1 text-xs text-muted-foreground">{t("habits.unit")}
                <Input aria-label={t("habits.newFieldUnit")} className={inputClassName} value={newUnit} onChange={(event) => setNewUnit(event.target.value)} />
              </label>
              <label className="grid w-24 gap-1 text-xs text-muted-foreground">{t("habits.target")}
                <Input type="number" aria-label={t("habits.newFieldTarget")} className={inputClassName} value={newTarget} onChange={(event) => setNewTarget(event.target.value)} />
              </label>
            </>
          )}
          <Button type="button" variant="secondary" onClick={addField} className="min-h-11">
            <Plus aria-hidden="true" /> {t("habits.addButton")}
          </Button>
        </div>
      </section>

      <section aria-labelledby="habit-danger-heading" className="space-y-3 border-t border-border pt-4">
        <h3 id="habit-danger-heading" className="text-sm font-semibold">{t("habits.danger")}</h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("habits.archiveDescription")}</p>
          <Button type="button" variant="destructive" disabled={managedByBooks} onClick={() => void write(onArchive)} className="min-h-11">
            <Archive aria-hidden="true" /> {t("habits.archive")}
          </Button>
        </div>
      </section>

      <footer className="flex justify-end border-t border-border pt-3">
        <Button type="button" variant="ghost" onClick={onClose} className="min-h-11">{t("habits.closeEditor")}</Button>
      </footer>
    </div>
  );
}
