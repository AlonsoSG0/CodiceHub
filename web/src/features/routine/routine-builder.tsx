/* Build surface: settings, day windows, block editing and workspace-backed links (S21–S24). */

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDown, Copy, Minus, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { fetchLinkTargets } from "./routine-api";
import { blocksOf, segmentsOfDay, toMinutes, toTime, windowOf } from "./routine-model";
import { WEEKDAYS, type BlockInput, type BlockLink, type DayWindow, type LinkTargets, type RoutineBlock, type Weekday } from "./types";
import type { RoutineStore } from "./use-routine";
import { useT } from "@/i18n";

function weekdayLabel(day: Weekday, locale: string, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(locale, { weekday: style }).format(new Date(2026, 0, 4 + day, 12));
}

type BlockDraft = { title: string; start: string; end: string; intent: "must" | "want"; link: string; note: string };
type WindowGroup = { weekdays: Weekday[]; window: DayWindow };
type FreeSlot = { start: string; end: string } | null;

function firstFreeSlot(blocks: readonly RoutineBlock[], window: DayWindow, from = toMinutes(window.start)): FreeSlot {
  const windowStart = toMinutes(window.start);
  const windowEnd = toMinutes(window.end);
  let cursor = Math.max(windowStart, from);

  for (const block of blocks) {
    if (toMinutes(block.end) <= cursor) continue;
    const blockStart = toMinutes(block.start);
    if (blockStart - cursor >= 30) return { start: toTime(cursor), end: toTime(cursor + 30) };
    cursor = Math.max(cursor, toMinutes(block.end));
  }

  return windowEnd - cursor >= 30 ? { start: toTime(cursor), end: toTime(cursor + 30) } : null;
}

function isValidWindowTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function constructorOrdinal(blocks: readonly RoutineBlock[], start: string): number {
  const startMinutes = toMinutes(start);
  return blocks.filter((block) => toMinutes(block.start) <= startMinutes).length + 1;
}

function draftOf(block: RoutineBlock): BlockDraft {
  return { title: block.title, start: block.start, end: block.end, intent: block.intent, link: linkValue(block.link), note: block.note };
}

function parseLink(value: string): BlockLink | null {
  if (value === "none") return null;
  const [kind, ...id] = value.split(":");
  if (kind !== "habit" && kind !== "task" && kind !== "goal") return null;
  return { kind, id: id.join(":") };
}

function linkValue(link: BlockLink | null): string {
  return link === null ? "none" : `${link.kind}:${link.id}`;
}

function linkLabel(link: BlockLink | null, targets: LinkTargets | null, t: ReturnType<typeof useT>["t"]): string {
  if (link === null) return t("routine.noLink");
  if (targets === null) return t("routine.loadingWorkspaceLinks");
  if (link.kind === "habit") return targets.habits.find((entry) => entry.id === link.id)?.name ?? t("routine.unavailableHabit");
  if (link.kind === "task") {
    const task = targets.tasks.find((entry) => entry.id === link.id);
    return task ? `${task.title} · ${task.projectName}` : t("routine.unavailableTask");
  }
  return targets.goals.find((entry) => entry.id === link.id)?.title ?? t("routine.unavailableGoal");
}

function LinkSelect({ value, onChange, label, targets, loading, error }: {
  value: string; onChange: (value: string) => void; label: string;
  targets: LinkTargets | null; loading: boolean; error: string | null;
}) {
  const { t } = useT();
  const empty = !loading && error === null && targets !== null && !targets.habits.length && !targets.tasks.length && !targets.goals.length;
  const selectedLink = parseLink(value);
  const missingLink = !loading && targets !== null && selectedLink !== null && (
    selectedLink.kind === "habit" ? !targets.habits.some((entry) => entry.id === selectedLink.id)
      : selectedLink.kind === "task" ? !targets.tasks.some((entry) => entry.id === selectedLink.id)
        : !targets.goals.some((entry) => entry.id === selectedLink.id)
  );
  const unavailableLabel = selectedLink?.kind === "habit" ? t("routine.unavailableHabitArchived")
    : selectedLink?.kind === "task" ? t("routine.unavailableTaskArchived")
      : t("routine.unavailableGoalArchived");
  const selectedLabel = value === "none" ? t("routine.noLink")
    : missingLink ? unavailableLabel
      : selectedLink?.kind === "habit" ? `${t("routine.habit")} · ${targets?.habits.find((entry) => entry.id === selectedLink.id)?.name ?? ""}`
        : selectedLink?.kind === "task" ? `${t("routine.task")} · ${targets?.tasks.find((entry) => entry.id === selectedLink.id)?.title ?? ""}`
          : selectedLink?.kind === "goal" ? `${t("routine.goal")} · ${targets?.goals.find((entry) => entry.id === selectedLink.id)?.title ?? ""}`
            : undefined;
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger aria-label={label} className="h-11 w-full"><SelectValue>{selectedLabel}</SelectValue></SelectTrigger>
      <SelectContent>
        <SelectItem value="none" onClick={() => onChange("none")} className="min-h-11">{t("routine.noLink")}</SelectItem>
        {loading ? <SelectItem value="loading" disabled className="min-h-11">{t("routine.loadingWorkspaceLinks")}</SelectItem> : null}
        {error ? <SelectItem value="unavailable" disabled className="min-h-11">{t("routine.linksUnavailable")}</SelectItem> : null}
        {empty ? <SelectItem value="empty" disabled className="min-h-11">{t("routine.noLinkTargets")}</SelectItem> : null}
        {missingLink ? <SelectItem value={value} disabled className="min-h-11">{unavailableLabel}</SelectItem> : null}
        {targets?.habits.map((entry) => <SelectItem key={`habit:${entry.id}`} value={`habit:${entry.id}`} className="min-h-11">{t("routine.habit")} · {entry.name}</SelectItem>)}
        {targets?.tasks.map((entry) => <SelectItem key={`task:${entry.id}`} value={`task:${entry.id}`} className="min-h-11">{t("routine.task")} · {entry.title} · {entry.projectName}</SelectItem>)}
        {targets?.goals.map((entry) => <SelectItem key={`goal:${entry.id}`} value={`goal:${entry.id}`} className="min-h-11">{t("routine.goal")} · {entry.title}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function TimeAdjust({ label, value, onChange }: { label: string; value: string; onChange: (time: string) => void }) {
  const { t } = useT();
  const minute = toMinutes(value);
  const adjust = (delta: number) => {
    const next = minute + delta;
    if (next >= 0 && next <= 23 * 60 + 59) onChange(toTime(next));
  };
  return <div className="flex items-center gap-1">
    <Input aria-label={label} type="time" step={60} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full sm:w-32" />
    <Button type="button" variant="outline" aria-label={t("routine.decreaseByTen", { label })} disabled={minute < 10} onClick={() => adjust(-10)} className="size-10 shrink-0 px-0"><Minus aria-hidden="true" /></Button>
    <Button type="button" variant="outline" aria-label={t("routine.increaseByTen", { label })} disabled={minute > 23 * 60 + 49} onClick={() => adjust(10)} className="size-10 shrink-0 px-0"><Plus aria-hidden="true" /></Button>
  </div>;
}

function BlockEditor({ block, ordinal, onSave, onDelete, targets, targetsLoading, targetsError }: {
  block: RoutineBlock; ordinal: number; onSave: (draft: BlockDraft) => void; onDelete: () => void;
  targets: LinkTargets | null; targetsLoading: boolean; targetsError: string | null;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(() => draftOf(block));
  const change = (patch: Partial<BlockDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(draft); };
  return <li className="min-w-0 rounded-lg border border-border bg-background p-3">
    <form onSubmit={submit} className="grid min-w-0 gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground"><span>{t("routine.blockOrdinal", { ordinal })}</span><Input aria-label={t("routine.blockTitle")} value={draft.title} onChange={(event) => change({ title: event.target.value })} className="h-11 text-foreground" /></label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("routine.start")}<TimeAdjust label={t("routine.startTime")} value={draft.start} onChange={(start) => change({ start })} /></label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("routine.end")}<TimeAdjust label={t("routine.endTime")} value={draft.end} onChange={(end) => change({ end })} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("routine.intent")}
          <Select value={draft.intent} onValueChange={(value) => value && change({ intent: value as BlockDraft["intent"] })}>
            <SelectTrigger aria-label={t("routine.blockIntent")} className="h-11 w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="must" className="min-h-11">{t("routine.must")}</SelectItem><SelectItem value="want" className="min-h-11">{t("routine.want")}</SelectItem></SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">{t("routine.link")}
          <LinkSelect label={t("routine.blockLink")} value={draft.link} onChange={(link) => change({ link })} targets={targets} loading={targetsLoading} error={targetsError} />
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("routine.note")}<Input aria-label={t("routine.blockNote")} value={draft.note} onChange={(event) => change({ note: event.target.value })} className="h-11 text-foreground" /></label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" aria-label={t("routine.deleteBlock")} onClick={onDelete} className="min-h-11 gap-1.5 text-destructive hover:text-destructive"><Trash2 aria-hidden="true" /> {t("routine.delete")}</Button>
        <Button type="submit" variant="outline" aria-label={t("routine.saveBlock")} className="min-h-11 gap-1.5"><Save aria-hidden="true" /> {t("routine.saveBlock")}</Button>
      </div>
    </form>
  </li>;
}

function groupWindows(state: NonNullable<RoutineStore["state"]>): WindowGroup[] {
  const groups = new Map<string, WindowGroup>();
  for (const day of WEEKDAYS) {
    const window = windowOf(state, day);
    if (window.start === state.settings.dayStart && window.end === state.settings.dayEnd) continue;
    const key = `${window.start}|${window.end}`;
    const group = groups.get(key) ?? { weekdays: [], window };
    group.weekdays.push(day);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function RoutineBuilder({ store }: { store: RoutineStore }) {
  const toast = useToast();
  const { t, locale } = useT();
  const [weekday, setWeekday] = useState<Weekday>(() => store.state?.settings.weekStartsOn ?? 1);
  const [confirmClear, setConfirmClear] = useState(false);
  const [newBlock, setNewBlock] = useState<BlockDraft>({ title: "", start: "", end: "", intent: "must", link: "none", note: "" });
  const [noFurtherSlot, setNoFurtherSlot] = useState(false);
  const [targets, setTargets] = useState<LinkTargets | null>(null);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [windowComposer, setWindowComposer] = useState(false);
  const [selectedWindowDays, setSelectedWindowDays] = useState<Weekday[]>([]);
  const [windowDraft, setWindowDraft] = useState<DayWindow>({ start: "07:00", end: "23:00" });
  const [editingWindow, setEditingWindow] = useState<string | null>(null);
  const [editingTimes, setEditingTimes] = useState<DayWindow>({ start: "07:00", end: "23:00" });
  const seenError = useRef<string | null>(null);
  const previousIds = useRef<Set<string> | null>(null);
  const previousWeekday = useRef<Weekday | null>(null);
  const state = store.state;

  useEffect(() => {
    let active = true;
    fetchLinkTargets().then((result) => { if (active) setTargets(result); }).catch((failure: unknown) => {
      if (active) setTargetsError(failure instanceof Error ? failure.message : t("routine.workspaceLinksLoadFailed"));
    }).finally(() => { if (active) setTargetsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (store.error === null || store.error === seenError.current) return;
    seenError.current = store.error;
    toast({ tone: "error", title: t("routine.saveRoutineFailed"), description: store.error });
    store.clearError();
  }, [store.error, store.clearError, toast]);

  const dayBlocks = state ? blocksOf(state, weekday) : [];
  useEffect(() => {
    if (!state) return;
    const currentIds = new Set(dayBlocks.map((block) => block.id));
    const firstRun = previousIds.current === null;
    const weekdayChanged = previousWeekday.current !== weekday;
    const created = !firstRun && !weekdayChanged
      ? dayBlocks.find((block) => !previousIds.current?.has(block.id))
      : undefined;
    const deleted = !firstRun && !weekdayChanged && [...(previousIds.current ?? [])].some((id) => !currentIds.has(id));
    previousIds.current = currentIds;
    previousWeekday.current = weekday;

    if (firstRun || weekdayChanged || created || deleted) {
      const slot = firstFreeSlot(
        dayBlocks,
        windowOf(state, weekday),
        created ? toMinutes(created.end) : undefined,
      );
      setNoFurtherSlot(slot === null);
      setNewBlock((current) => ({
        ...current,
        ...(slot ?? { start: "", end: "" }),
        ...(created ? { title: "", note: "" } : {}),
      }));
    }
  }, [state, weekday, dayBlocks]);

  const windowGroups = useMemo(() => state ? groupWindows(state) : [], [state]);
  if (state === null) return null;

  const day = state.days.find((candidate) => candidate.weekday === weekday);
  const dayWindow = windowOf(state, weekday);
  const segments = segmentsOfDay(state, weekday);
  const updateNewBlock = (patch: Partial<BlockDraft>) => setNewBlock((current) => ({ ...current, ...patch }));
  const saveBlock = (blockId: string, draft: BlockDraft) => {
    seenError.current = null;
    void store.updateBlock(blockId, { title: draft.title, start: draft.start, end: draft.end, intent: draft.intent, link: parseLink(draft.link), note: draft.note });
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    const input: BlockInput = { title: newBlock.title, start: newBlock.start, end: newBlock.end, intent: newBlock.intent, link: parseLink(newBlock.link), note: newBlock.note };
    seenError.current = null;
    void store.createBlock(weekday, input);
  };
  const saveWindow = (days: Weekday[], window: DayWindow) => {
    const dayWindows = { ...state.settings.dayWindows };
    days.forEach((dayIndex) => { dayWindows[dayIndex] = window; });
    void store.saveSettings({ dayWindows });
  };
  const removeWindow = (days: Weekday[]) => {
    const dayWindows = { ...state.settings.dayWindows };
    days.forEach((dayIndex) => { delete dayWindows[dayIndex]; });
    void store.saveSettings({ dayWindows });
  };
  const nextFreeSlot = () => {
    const slot = firstFreeSlot(dayBlocks, dayWindow, toMinutes(newBlock.start || dayWindow.start));
    setNoFurtherSlot(slot === null);
    if (slot) setNewBlock((current) => ({ ...current, ...slot }));
  };
  const changeWindowTime = (current: DayWindow, field: keyof DayWindow, value: string, update: (window: DayWindow) => void) => {
    if (!isValidWindowTime(value)) {
      toast({ tone: "error", title: t("routine.validWindowTime") });
      return;
    }
    update({ ...current, [field]: value });
  };
  const linkTargetsEmpty = !targetsLoading && targets !== null && targets.habits.length + targets.tasks.length + targets.goals.length === 0;

  return <section aria-label={t("routine.buildTheRoutine")} className="space-y-5">
    <section aria-label={t("routine.routineSettings")} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(13rem,0.75fr)_minmax(0,2fr)] sm:items-start">
      <div className="grid min-w-0 gap-2">
        <label className="grid gap-1 text-sm font-medium">{t("routine.weekStartsOn")}
          <Select value={String(state.settings.weekStartsOn)} onValueChange={(value) => value && void store.saveSettings({ weekStartsOn: Number(value) as Weekday })}>
            <SelectTrigger aria-label={t("routine.weekStartsOn")} className="h-10 w-full"><SelectValue>{weekdayLabel(state.settings.weekStartsOn, locale)}</SelectValue></SelectTrigger>
            <SelectContent>{WEEKDAYS.map((dayIndex) => <SelectItem key={dayIndex} value={String(dayIndex)} className="min-h-11">{weekdayLabel(dayIndex, locale)}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        {/* The base window lives here so the left column is not a single control over empty space. */}
        <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
          <h3 className="text-[13px] font-medium">{t("routine.everyDay")}</h3>
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <Input aria-label={t("routine.dayStarts")} type="time" step={60} value={state.settings.dayStart} onChange={(event) => { const value = event.target.value; if (!isValidWindowTime(value)) { toast({ tone: "error", title: t("routine.validWindowTime") }); return; } void store.saveSettings({ dayStart: value }); }} className="h-9 min-w-0 flex-1 text-foreground" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input aria-label={t("routine.dayEnds")} type="time" step={60} value={state.settings.dayEnd} onChange={(event) => { const value = event.target.value; if (!isValidWindowTime(value)) { toast({ tone: "error", title: t("routine.validWindowTime") }); return; } void store.saveSettings({ dayEnd: value }); }} className="h-9 min-w-0 flex-1 text-foreground" />
          </div>
        </div>
        <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{t("routine.editableHistory")}</span>
          <Select value={String(state.settings.editWindowDays)} onValueChange={(value) => value && void store.saveSettings({ editWindowDays: Number(value) as 3 | 7 })}>
            <SelectTrigger aria-label={t("routine.editableHistory")} className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="7" className="min-h-8">{t("routine.sevenDays")}</SelectItem><SelectItem value="3" className="min-h-8">{t("routine.threeDays")}</SelectItem></SelectContent>
          </Select>
        </label>
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex min-h-11 items-center justify-between gap-3"><h2 className="text-sm font-semibold">{t("routine.wakingWindows")}</h2>
          <Button type="button" variant="outline" onClick={() => { setWindowComposer((open) => !open); setSelectedWindowDays([]); }} className="min-h-11 shrink-0">{windowComposer ? t("routine.cancel") : t("routine.addWindow")}</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {windowGroups.map(({ weekdays, window }) => {
            const key = weekdays.join(",");
            return <div key={key} className="min-w-0 rounded-lg border border-border px-3 py-1.5 sm:col-span-2">
              {editingWindow === key ? <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-0.5 text-[11px] text-muted-foreground">{t("routine.windowStart")}<Input aria-label={t("routine.editWindowStart")} type="time" value={editingTimes.start} onChange={(event) => changeWindowTime(editingTimes, "start", event.target.value, setEditingTimes)} className="h-10 text-foreground" /></label>
                <label className="grid gap-0.5 text-[11px] text-muted-foreground">{t("routine.windowEnd")}<Input aria-label={t("routine.editWindowEnd")} type="time" value={editingTimes.end} onChange={(event) => changeWindowTime(editingTimes, "end", event.target.value, setEditingTimes)} className="h-10 text-foreground" /></label>
                <Button type="button" onClick={() => { saveWindow(weekdays, editingTimes); setEditingWindow(null); }} className="min-h-11">{t("routine.saveChanges")}</Button>
              </div> : <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-sm tabular-nums">{weekdays.map((dayIndex) => weekdayLabel(dayIndex, locale)).join(" · ")}: {window.start}–{window.end}</p>
                <div className="flex shrink-0 gap-0.5"><Button type="button" variant="ghost" size="icon-sm" aria-label={t("routine.edit")} onClick={() => { setEditingWindow(key); setEditingTimes(window); }}><Pencil aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={t("routine.delete")} className="text-destructive hover:text-destructive" onClick={() => removeWindow(weekdays)}><Trash2 aria-hidden="true" /></Button></div>
              </div>}
            </div>;
          })}
        </div>
        {windowComposer ? <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm font-medium">{t("routine.chooseWeekdaysFirst")}</p>
          <div role="group" aria-label={t("routine.chooseWeekdaysForWindow")} className="flex flex-wrap gap-2">{WEEKDAYS.map((dayIndex) => <Button key={dayIndex} type="button" variant={selectedWindowDays.includes(dayIndex) ? "secondary" : "outline"} aria-pressed={selectedWindowDays.includes(dayIndex)} onClick={() => setSelectedWindowDays((current) => current.includes(dayIndex) ? current.filter((item) => item !== dayIndex) : [...current, dayIndex])} className="min-h-10">{weekdayLabel(dayIndex, locale)}</Button>)}</div>
          <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-0.5 text-[11px] text-muted-foreground">{t("routine.windowStart")}<Input aria-label={t("routine.windowStart")} type="time" value={windowDraft.start} onChange={(event) => changeWindowTime(windowDraft, "start", event.target.value, setWindowDraft)} className="h-10 text-foreground" /></label><label className="grid gap-0.5 text-[11px] text-muted-foreground">{t("routine.windowEnd")}<Input aria-label={t("routine.windowEnd")} type="time" value={windowDraft.end} onChange={(event) => changeWindowTime(windowDraft, "end", event.target.value, setWindowDraft)} className="h-10 text-foreground" /></label></div>
          <Button type="button" disabled={selectedWindowDays.length === 0} onClick={() => { saveWindow(selectedWindowDays, windowDraft); setWindowComposer(false); }} className="min-h-11">{t("routine.saveWindow")}</Button>
        </div> : null}
        <div aria-label={t("routine.resolvedWeekdayWindows")} className="flex flex-wrap gap-1">{WEEKDAYS.map((dayIndex) => { const resolved = windowOf(state, dayIndex); const own = state.settings.dayWindows[dayIndex] !== undefined; const label = `${weekdayLabel(dayIndex, locale)}: ${resolved.start}–${resolved.end}`; return <span key={dayIndex} aria-label={label} title={label} className={cn("rounded-md border px-1.5 py-0.5 text-[11px] leading-4 tabular-nums", own ? "border-border text-foreground" : "border-transparent bg-muted/30 text-muted-foreground")}>{weekdayLabel(dayIndex, locale, "short")} {resolved.start}–{resolved.end}</span>; })}</div>
      </div>
    </section>

    <div className="flex flex-wrap gap-2" role="group" aria-label={t("routine.chooseDayToEdit")}>{WEEKDAYS.map((dayIndex) => <Button key={dayIndex} type="button" variant={weekday === dayIndex ? "secondary" : "outline"} aria-pressed={weekday === dayIndex} aria-label={weekdayLabel(dayIndex, locale)} onClick={() => { setWeekday(dayIndex); setConfirmClear(false); setNoFurtherSlot(false); previousIds.current = new Set(blocksOf(state, dayIndex).map((block) => block.id)); }} className="min-h-11">{weekdayLabel(dayIndex, locale)}</Button>)}</div>

    <section aria-label={t("routine.weekdayRoutine", { weekday: weekdayLabel(weekday, locale) })} className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-foreground">{weekdayLabel(weekday, locale)}</h2>{day?.isTemplate ? <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{t("routine.templateDay")}</span> : null}</div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void store.repeatDay(weekday)} className="min-h-11 gap-1.5"><Copy aria-hidden="true" /> {t("routine.repeatDayAcrossWeek")}</Button><Button type="button" variant="ghost" onClick={() => { if (!confirmClear) { setConfirmClear(true); return; } setConfirmClear(false); void store.clearDay(weekday); }} className="min-h-11 gap-1.5 text-destructive hover:text-destructive"><Trash2 aria-hidden="true" /> {confirmClear ? t("routine.confirmClearDay") : t("routine.clearDay")}</Button></div>
      </header>
      <p className="text-xs text-muted-foreground">{t("routine.sleepOutsideWindow", { start: dayWindow.start, end: dayWindow.end })}</p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.65fr)]">
        <div className="min-w-0 space-y-4">
          <form onSubmit={create} className="grid gap-3 rounded-xl border border-dashed border-border p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t("routine.addBlock")} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">#{constructorOrdinal(dayBlocks, newBlock.start || dayWindow.start)}</span></h3><Button type="button" variant="outline" onClick={nextFreeSlot} className="min-h-10 gap-1.5"><ArrowDown aria-hidden="true" /> {t("routine.next")}</Button></div>{noFurtherSlot ? <p className="text-sm text-muted-foreground">{t("routine.noFurtherSlot")}</p> : null}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"><label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("routine.titleLabel")}<Input aria-label={t("routine.newBlockTitle")} value={newBlock.title} onChange={(event) => updateNewBlock({ title: event.target.value })} className="h-11 text-foreground" /></label><label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("routine.start")}<TimeAdjust label={t("routine.newBlockStartTime")} value={newBlock.start} onChange={(start) => updateNewBlock({ start })} /></label><label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("routine.end")}<TimeAdjust label={t("routine.newBlockEndTime")} value={newBlock.end} onChange={(end) => updateNewBlock({ end })} /></label></div>
            <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("routine.intent")}<Select value={newBlock.intent} onValueChange={(value) => value && updateNewBlock({ intent: value as BlockDraft["intent"] })}><SelectTrigger aria-label={t("routine.newBlockIntent")} className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="must" className="min-h-11">{t("routine.must")}</SelectItem><SelectItem value="want" className="min-h-11">{t("routine.want")}</SelectItem></SelectContent></Select></label><label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">{t("routine.link")}<LinkSelect label={t("routine.newBlockLink")} value={newBlock.link} onChange={(link) => updateNewBlock({ link })} targets={targets} loading={targetsLoading} error={targetsError} /></label></div>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("routine.note")}<Input aria-label={t("routine.newBlockNote")} value={newBlock.note} onChange={(event) => updateNewBlock({ note: event.target.value })} className="h-11 text-foreground" /></label>
            <div className="flex justify-end"><Button type="submit" className="min-h-11 gap-1.5"><Plus aria-hidden="true" /> {t("routine.addBlockAction")}</Button></div>
          </form>
          <ol aria-label={t("routine.weekdayTimeline", { weekday: weekdayLabel(weekday, locale) })} className="space-y-2">{segments.map((segment, index) => segment.kind === "block" ? <BlockEditor key={segment.block.id} block={segment.block} ordinal={dayBlocks.findIndex((block) => block.id === segment.block.id) + 1} onSave={(draft) => saveBlock(segment.block.id, draft)} onDelete={() => void store.deleteBlock(segment.block.id)} targets={targets} targetsLoading={targetsLoading} targetsError={targetsError} /> : <li key={`${segment.kind}-${segment.start}-${index}`} className={cn("rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground", segment.kind === "sleep" ? "bg-muted/40" : "")}><span className="font-medium">{segment.kind === "sleep" ? t("routine.sleep") : t("routine.unplanned")}</span><span className="ml-2 tabular-nums">{segment.start}–{segment.end}</span></li>)}</ol>
        </div>
        <aside aria-label={t("routine.weekdayOverview", { weekday: weekdayLabel(weekday, locale) })} className="h-fit rounded-xl border border-border p-4"><h3 className="text-sm font-semibold">{t("routine.dayAtGlance")}</h3>{noFurtherSlot ? <p className="mt-3 text-sm text-muted-foreground">{t("routine.noFurtherSlot")}</p> : null}{dayBlocks.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("routine.noBlocksPlannedYet")}</p> : <ol className="mt-3 space-y-2">{dayBlocks.map((block, index) => <li key={block.id} className="rounded-lg bg-muted/30 p-3"><p className="text-sm font-medium"><span className="mr-2 text-muted-foreground">{index + 1}.</span>{block.title || t("routine.untitledBlock")}</p><p className="mt-1 text-xs tabular-nums text-muted-foreground">{block.start}–{block.end}</p><p className="mt-1 text-xs text-muted-foreground">{linkLabel(block.link, targets, t)}</p></li>)}</ol>}{targetsLoading ? <p className="mt-3 text-xs text-muted-foreground">{t("routine.loadingWorkspaceLinks")}</p> : null}{targetsError ? <p className="mt-3 text-xs text-destructive">{t("routine.workspaceLinksLoadFailed")}</p> : null}{linkTargetsEmpty ? <p className="mt-3 text-xs text-muted-foreground">{t("routine.noLinkTargets")}</p> : null}</aside>
      </div>
    </section>
  </section>;
}
