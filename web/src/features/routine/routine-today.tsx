/*
 * PROTOTYPE — the Today surface, the guide. Renders the day from the waking window to the waking window, marks the
 * block that contains the current minute, names the next one, and records states from there (S6, S7, S8, S9).
 */

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, Moon, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays } from "@/features/habits/date";
import { cn } from "@/lib/utils";
import { blockProgress, blocksForDate, currentBlock, isFrozenDay, minuteOfDay, nextBlock, noteOf, segmentsOfDay, statusOf, tallyOf, weekdayOf } from "./routine-model";
import type { DayKey } from "@/features/habits/date";
import type { BlockStatus, RoutineBlock } from "./types";
import type { RoutineStore } from "./use-routine";
import { useT } from "@/i18n";

const statusActions: Array<{ status: Exclude<BlockStatus, "pending"> }> = [
  { status: "done" },
  { status: "missed" },
  { status: "excused" },
  { status: "skipped" },
];

function localDate(day: DayKey): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12);
}

function blockHeight(block: RoutineBlock): number {
  const [startHour, startMinute] = block.start.split(":").map(Number);
  const [endHour, endMinute] = block.end.split(":").map(Number);
  return Math.max(46, (endHour * 60 + endMinute - startHour * 60 - startMinute) * 0.72);
}

export function RoutineToday({ store, today, date, now, onDateChange }: { store: RoutineStore; today: DayKey; date: DayKey; now: Date; onDateChange: (next: DayKey) => void }) {
  const { t, locale } = useT();
  const state = store.state;
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  if (state === null) return null;

  const weekday = weekdayOf(date);
  const segments = segmentsOfDay(state, weekday);
  const minute = minuteOfDay(now);
  const isToday = date === today;
  const isFuture = date > today;
  const isFrozen = isFrozenDay(state, date, today);
  const cannotRecord = isFuture || isFrozen;
  const blocks = blocksForDate(state, date);
  const active = isToday ? currentBlock(blocks, minute) : null;
  const upcoming = isToday ? nextBlock(blocks, minute) : null;
  const tally = tallyOf(state, date, today);
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }).format(localDate(date));
  const saveNote = (block: RoutineBlock) => {
    if (cannotRecord) return;
    const status = statusOf(state, block, date, today);
    void store.setOccurrence(block.id, date, { status, note: draftNotes[`${block.id}:${date}`] ?? noteOf(state, block.id, date) });
  };

  return (
    <section aria-label={t("routine.todaysRoutine")} className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dateLabel}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{isToday ? t("routine.today") : t("routine.title")}</h2>
          </div>
          <nav aria-label={t("routine.dayNavigation")} className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label={t("routine.previousDay")} onClick={() => onDateChange(addDays(date, -1))} className="size-9">
              <ChevronLeft aria-hidden="true" />
            </Button>
            {isToday ? null : <Button type="button" variant="outline" size="sm" onClick={() => onDateChange(today)} className="h-9 px-3 text-sm">{t("routine.today")}</Button>}
            <Button type="button" variant="ghost" size="icon" aria-label={t("routine.nextDay")} onClick={() => onDateChange(addDays(date, 1))} className="size-9">
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label={isToday ? t("routine.todaysTally") : t("routine.dayTally")}>
          <span><strong className="tabular-nums text-foreground">{tally.done}</strong> {t("routine.done")}</span>
          <span><strong className="tabular-nums text-foreground">{tally.pending}</strong> {t("routine.pending")}</span>
          <span><strong className="tabular-nums text-foreground">{tally.pending}</strong> {t("routine.left")}</span>
        </div>
      </header>

      {isFrozen ? <p className="text-sm text-muted-foreground">{t("routine.dayClosed")}</p> : null}

      {isToday ? <div className="grid gap-3 sm:grid-cols-2">
        <section aria-label={t("routine.currentBlock")} className={cn("rounded-xl border p-4", active ? "border-foreground/25 bg-muted/50" : "border-border")}>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Clock3 className="size-3.5" aria-hidden="true" />{t("routine.now")}</p>
          {active ? <><h3 className="mt-2 text-lg font-semibold text-foreground">{active.title}</h3><p className="mt-1 text-sm text-muted-foreground">{active.start}–{active.end} · {t("routine.percentThrough", { percent: Math.round(blockProgress(active, minute) * 100) })}</p></> : <p className="mt-2 text-sm text-muted-foreground">{t("routine.noCurrentBlock")}</p>}
        </section>
        <section aria-label={t("routine.nextBlock")} className="rounded-xl border border-border p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><SkipForward className="size-3.5" aria-hidden="true" />{t("routine.upNext")}</p>
          {upcoming ? <><h3 className="mt-2 text-lg font-semibold text-foreground">{upcoming.title}</h3><p className="mt-1 text-sm text-muted-foreground">{upcoming.start}–{upcoming.end}</p></> : <p className="mt-2 text-sm text-muted-foreground">{t("routine.nothingElseToday")}</p>}
        </section>
      </div> : null}

      <div aria-label={t("routine.dayTimeline")} className="space-y-1">
        {segments.map((segment, index) => {
          if (segment.kind === "sleep") return <div key={`sleep-${index}`} className="grid min-h-8 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 text-xs text-muted-foreground/60"><span className="text-right tabular-nums">{segment.start}</span><div className="flex items-center gap-2 border-l border-border/40 pl-3"><Moon className="size-3" aria-hidden="true" /><span>{t("routine.sleep")} · {segment.start}–{segment.end}</span></div></div>;
          if (segment.kind === "gap") return <div key={`gap-${index}`} className="grid min-h-8 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 text-xs text-muted-foreground"><span className="text-right tabular-nums">{segment.start}</span><div className="border-l border-dashed border-border pl-3">{t("routine.openTime")} · {segment.start}–{segment.end}</div></div>;
          const block = segment.block;
          const status = statusOf(state, block, date, today);
          const linkedMirror = block.link === null ? undefined : [...store.mirrors].reverse().find((mirror) => mirror.blockId === block.id && mirror.date === date);
          const noteKey = `${block.id}:${date}`;
          const note = draftNotes[noteKey] ?? noteOf(state, block.id, date);
          const isCurrent = isToday && active?.id === block.id;
          return <article key={block.id} aria-label={`${block.title}, ${block.start} to ${block.end}`} className={cn("grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3", isCurrent && "rounded-xl bg-muted/30")} style={{ minHeight: blockHeight(block) }}>
            <span className="pt-4 text-right text-xs tabular-nums text-muted-foreground">{block.start}</span>
            <div className={cn("min-w-0 border-l-2 py-3 pl-3 pr-2", isCurrent ? "border-foreground" : "border-border")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><h3 className="font-medium text-foreground">{block.title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{block.start}–{block.end} · {block.intent === "must" ? t("routine.obligation") : t("routine.want")} · {t(`routine.${status}`)}</p></div>
                {isCurrent ? <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-medium text-foreground">{t("routine.now")}</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {statusActions.map(({ status: choice }) => <Button key={choice} type="button" size="sm" variant={status === choice ? "secondary" : "ghost"} aria-pressed={status === choice} disabled={cannotRecord} onClick={() => { if (!cannotRecord) void store.setOccurrence(block.id, date, { status: choice }); }} className="h-7 px-2 text-xs">{choice === "done" ? <Check aria-hidden="true" /> : null}{t(`routine.${choice}`)}</Button>)}
              </div>
              <div className="mt-2 flex max-w-lg items-center gap-2">
                <Input aria-label={t("routine.noteFor", { title: block.title })} value={note} disabled={cannotRecord} placeholder={t("routine.addNote")} onChange={(event) => setDraftNotes((notes) => ({ ...notes, [noteKey]: event.target.value }))} onBlur={() => { if (!cannotRecord && note !== noteOf(state, block.id, date)) saveNote(block); }} className="h-8 text-xs" />
                <Button type="button" variant="ghost" size="sm" disabled={cannotRecord} onClick={() => saveNote(block)} className="h-8 px-2 text-xs">{t("routine.saveNote")}</Button>
              </div>
              {linkedMirror ? <p role="status" className="mt-2 text-xs text-muted-foreground">{linkedMirror.written ? t("routine.linkTargetUpdated", { target: t(`routine.${linkedMirror.target}`) }) : linkedMirror.reason === "target_missing" ? t("routine.mirrorTargetMissing", { target: t(`routine.${linkedMirror.target}`) }) : linkedMirror.reason === "no_completed_column" ? t("routine.mirrorNoCompletedColumn") : linkedMirror.reason === "mirror_failed" ? t("routine.mirrorUpdateFailed", { target: t(`routine.${linkedMirror.target}`) }) : t("routine.mirrorNotUpdated", { target: t(`routine.${linkedMirror.target}`) })}</p> : null}
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}
