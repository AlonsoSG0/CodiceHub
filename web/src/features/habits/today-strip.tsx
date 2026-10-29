import { Check, Flame, StickyNote } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HabitIcon } from "./habit-icon";
import { currentStreak } from "./level";
import type { DayKey } from "./date";
import type { Habit, HabitEntry, HabitValueInput } from "./habits-api";

type TodayStripProps = {
  habits: Habit[];
  entries: HabitEntry[];
  day: DayKey;
  today?: DayKey;
  onSetValues: (habitId: string, date: DayKey, values: HabitValueInput[]) => Promise<unknown>;
  onEditHabit?: (habitId: string) => void;
};

function valueFor(entries: HabitEntry[], habitId: string, fieldId: string): HabitEntry["value"] | undefined {
  return entries.find((entry) => entry.habitId === habitId && entry.fieldId === fieldId)?.value;
}

export function TodayStrip({ habits, entries, day, today, onSetValues, onEditHabit }: TodayStripProps) {
  const { t } = useT();
  const readOnly = today !== undefined && day > today;
  const dayEntries = useMemo(() => entries.filter((entry) => entry.date === day), [day, entries]);
  const [checkValues, setCheckValues] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const focusedFieldId = useRef<string | null>(null);
  const lastCommit = useRef<Record<string, string>>({});

  const initialValues = useMemo(() => {
    const checks: Record<string, boolean> = {};
    const nextDrafts: Record<string, string> = {};
    for (const habit of habits) {
      for (const field of habit.fields.filter((candidate) => candidate.archivedAt === null)) {
        const value = valueFor(dayEntries, habit.id, field.id);
        if (field.kind === "check") checks[field.id] = value === true;
        if (field.kind === "number" || field.kind === "text") nextDrafts[field.id] = value === undefined ? "" : String(value);
      }
    }
    return { checks, drafts: nextDrafts };
  }, [day, dayEntries, habits]);

  useEffect(() => {
    setCheckValues(initialValues.checks);
    setDrafts((current) => {
      const focused = focusedFieldId.current;
      if (focused === null || current[focused] === undefined) return initialValues.drafts;
      return { ...initialValues.drafts, [focused]: current[focused] };
    });
  }, [initialValues]);

  async function toggleCheck(habitId: string, fieldId: string) {
    if (readOnly) return;
    const previous = checkValues[fieldId] ?? valueFor(dayEntries, habitId, fieldId) === true;
    const next = !previous;
    setAlert(null);
    setCheckValues((current) => ({ ...current, [fieldId]: next }));
    try {
      await onSetValues(habitId, day, [{ fieldId, value: next ? true : null }]);
    } catch (error) {
      setCheckValues((current) => ({ ...current, [fieldId]: previous }));
      setAlert(error instanceof Error ? error.message : t("habits.couldNotSaveCheckin"));
    }
  }

  async function commit(habitId: string, fieldId: string, kind: "number" | "text") {
    if (readOnly) return;
    const draft = drafts[fieldId] ?? "";
    const value = kind === "number" ? (draft.trim() === "" ? null : Number(draft)) : draft;
    if (typeof value === "number" && !Number.isFinite(value)) return;
    const previous = valueFor(dayEntries, habitId, fieldId);
    if (String(previous ?? "") === String(value ?? "")) return;
    const signature = `${kind}:${String(value ?? "")}`;
    if (lastCommit.current[fieldId] === signature) return;
    lastCommit.current[fieldId] = signature;
    setAlert(null);
    try {
      await onSetValues(habitId, day, [{ fieldId, value }]);
    } catch (error) {
      delete lastCommit.current[fieldId];
      setAlert(error instanceof Error ? error.message : t("habits.couldNotSaveCheckin"));
    }
  }

  return (
    <section aria-label={t("habits.checkins")} className="min-w-0 space-y-2">
      {alert ? <p role="alert" aria-live="assertive" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{alert}</p> : null}
      {habits.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">{t("habits.noActive")}</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {habits.map((habit) => {
            const fields = habit.fields.filter((field) => field.archivedAt === null).sort((left, right) => left.position - right.position);
            const trackable = fields.filter((field) => field.kind !== "text");
            const completed = trackable.filter((field) => {
              const value = field.kind === "check" ? checkValues[field.id] ?? valueFor(dayEntries, habit.id, field.id) : valueFor(dayEntries, habit.id, field.id);
              if (field.kind === "check") return value === true;
              return typeof value === "number" && (field.target === null ? value > 0 : value >= field.target);
            }).length;
            const streak = currentStreak(habit, today ?? day, entries);
            const checkFields = fields.filter((field) => field.kind === "check");
            const detailFields = fields.filter((field) => field.kind !== "check");

            return (
              <li key={habit.id} className="flex min-h-12 min-w-0 flex-col gap-1.5 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <HabitIcon name={habit.icon} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {onEditHabit ? (
                      <Button type="button" variant="ghost" onClick={() => onEditHabit(habit.id)} className="h-auto min-h-9 min-w-0 max-w-full justify-start p-0 text-left font-medium text-foreground hover:bg-transparent">
                        <span className="truncate">{habit.name}</span>
                      </Button>
                    ) : <span className="block truncate text-sm font-medium text-foreground">{habit.name}</span>}
                    <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground"><Flame className="size-3" aria-hidden="true" />{t("habits.streak", { count: streak })}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {trackable.length > 1 ? <span className="mr-1 text-xs font-medium tabular-nums text-muted-foreground">{completed}/{trackable.length}</span> : null}
                    {checkFields.map((field) => {
                      const fieldLabel = field.label || t("habits.done");
                      const accessibleName = `${habit.name} ${fieldLabel} ${day}`;
                      const checked = checkValues[field.id] ?? valueFor(dayEntries, habit.id, field.id) === true;
                      return (
                        <Button key={field.id} type="button" variant="ghost" size="icon" role="checkbox" aria-checked={checked} aria-label={accessibleName} disabled={readOnly} title={readOnly ? t("habits.unrecordable") : undefined} onClick={() => void toggleCheck(habit.id, field.id)} className="size-11 shrink-0 rounded-md text-muted-foreground transition-colors duration-150 motion-reduce:transition-none">
                          <span className={cn("flex size-[22px] items-center justify-center rounded-[6px] border transition-colors duration-150 motion-reduce:transition-none", checked ? "border-foreground bg-foreground text-background" : "border-border")}>{checked ? <Check aria-hidden="true" className="size-3.5" /> : null}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
                {detailFields.length > 0 ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 pl-10">
                    {detailFields.map((field) => {
                      const fieldLabel = field.label || (field.kind === "number" ? t("habits.value") : t("habits.note"));
                      const accessibleName = `${habit.name} ${fieldLabel} ${day}`;
                      if (field.kind === "number") {
                        return (
                          <label key={field.id} className="flex min-w-0 items-center gap-2 text-sm">
                            <span className="text-xs text-muted-foreground">{fieldLabel}</span>
                            <Input type="number" inputMode="decimal" aria-label={accessibleName} disabled={readOnly} value={drafts[field.id] ?? ""} onChange={(event) => { delete lastCommit.current[field.id]; setDrafts((current) => ({ ...current, [field.id]: event.target.value })); }} onFocus={() => { focusedFieldId.current = field.id; }} onBlur={() => { focusedFieldId.current = null; void commit(habit.id, field.id, "number"); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commit(habit.id, field.id, "number"); } }} className="h-8 w-16 px-1.5 text-right text-sm tabular-nums" />
                            {field.unit ? <span className="text-xs text-muted-foreground">{field.unit}</span> : null}
                            {field.target !== null ? <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{valueFor(dayEntries, habit.id, field.id) ?? "—"} / {field.target}{field.unit ? ` ${field.unit}` : ""}</span> : null}
                          </label>
                        );
                      }
                      const note = drafts[field.id] ?? "";
                      const expanded = openNotes[field.id] ?? false;
                      return (
                        <div key={field.id} className="flex min-w-0 items-center gap-2">
                          {!expanded ? (
                            <Button type="button" variant="ghost" disabled={readOnly} aria-expanded={false} aria-label={note ? t("habits.editNote", { name: habit.name }) : t("habits.addNoteFor", { name: habit.name })} className="h-8 max-w-40 justify-start gap-1.5 px-1.5 text-xs text-muted-foreground" onClick={() => setOpenNotes((current) => ({ ...current, [field.id]: true }))}>
                              <StickyNote aria-hidden="true" /><span className="truncate">{note || fieldLabel}</span>
                            </Button>
                          ) : (
                            <label className="flex min-w-0 items-center gap-2 text-sm">
                              <span className="sr-only">{fieldLabel}</span>
                              <Input type="text" aria-label={accessibleName} disabled={readOnly} placeholder={t("habits.addNote")} value={note} onChange={(event) => { delete lastCommit.current[field.id]; setDrafts((current) => ({ ...current, [field.id]: event.target.value })); }} onFocus={() => { focusedFieldId.current = field.id; }} onBlur={() => { focusedFieldId.current = null; void commit(habit.id, field.id, "text"); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commit(habit.id, field.id, "text"); } }} className="h-8 w-40 text-sm" />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
