/*
 * PROTOTYPE — the Week surface answers whether a repeated plan is legible and recordable across seven days.
 * Spec: `odd/tasks/routine.md` (S5-S9). This view records occurrences but never edits the plan.
 */

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { addDays } from "@/features/habits/date";
import { cn } from "@/lib/utils";
import { weekDates, orderedWeekdays, dayOf, isFrozenDay, statusOf, weekTallyOf, tallyOf, weekdayOf } from "./routine-model";
import type { BlockStatus } from "./types";
import type { DayKey } from "@/features/habits/date";
import type { RoutineStore } from "./use-routine";
import { useT } from "@/i18n";

// Widening the short range requires changing this one value.
const RANGE_DAYS = 3;
const statuses: BlockStatus[] = ["pending", "done", "missed", "excused", "skipped"];
function localDate(date: DayKey): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function RoutineWeek({ store, today }: { store: RoutineStore; today: DayKey }) {
  const { t, locale } = useT();
  const dateFormat = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  const longDateFormat = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const [range, setRange] = useState<"week" | "three-days">("week");
  const state = store.state;
  if (state === null) return null;

  const dates = range === "week"
    ? weekDates(state.settings.weekStartsOn, today)
    : Array.from({ length: RANGE_DAYS }, (_, index) => addDays(today, index));
  const weekdays = range === "week"
    ? orderedWeekdays(state.settings.weekStartsOn)
    : dates.map(weekdayOf);
  const tally = range === "week"
    ? weekTallyOf(state, today)
    : dates.reduce((total, date) => {
        if (date >= today) return total;
        const dayTally = tallyOf(state, date, today);
        return { done: total.done + dayTally.done, expected: total.expected + dayTally.expected };
      }, { done: 0, expected: 0 });
  const rate = tally.expected === 0 ? null : Math.round((tally.done / tally.expected) * 100);

  return (
    <section aria-label={t("routine.theRoutineWeek")} className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{range === "week" ? t("routine.thisWeek") : t("routine.nextThreeDays")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {range === "week" ? t("routine.weekly") : t("routine.range")} {t("routine.rate")}: <strong className="font-semibold tabular-nums text-foreground">{tally.done}/{tally.expected}</strong>
            {rate === null ? ` ${t("routine.obligationsCompleted")}` : ` ${t("routine.obligationsCompletedWithRate", { rate })}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("routine.weekScoringNote")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("routine.range")}</span>
            <select
              aria-label={t("routine.range")}
              className="min-h-8 w-32 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              value={range}
              onChange={(event) => setRange(event.target.value as "week" | "three-days")}
            >
              <option value="week">{t("routine.week")}</option>
              <option value="three-days">{t("routine.threeDays")}</option>
            </select>
          </label>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{range === "week" ? t("routine.sevenDayPlan") : t("routine.threeDayView")}</span>
        </div>
      </header>

      <div className={cn("grid min-w-0 grid-cols-1 gap-3", range === "week" ? "lg:grid-cols-7" : "md:grid-cols-3")}>
        {weekdays.map((weekday, index) => {
          const date = dates[index]!;
          const day = dayOf(state, weekday);
          const isToday = date === today;
          const cannotRecord = date > today || isFrozenDay(state, date, today);
          return (
            <section key={date} aria-label={`${longDateFormat.format(localDate(date))}${isToday ? `, ${t("routine.today")}` : ""}`} className={cn("min-w-0 rounded-xl border border-border bg-card p-3", isToday && "border-ring/60 bg-muted/30")}>
              <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{new Intl.DateTimeFormat(locale, { weekday: "long" }).format(localDate(date))}</h3>
                  <p className="text-xs text-muted-foreground">{dateFormat.format(localDate(date))}{isToday ? ` · ${t("routine.today")}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {isToday ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{t("routine.today")}</span> : null}
                  {day.isTemplate ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{t("routine.template")}</span> : null}
                </div>
              </header>
              {day.blocks.length === 0 ? <p className="py-2 text-xs text-muted-foreground">{t("routine.noBlocksPlanned")}</p> : (
                <ul className="space-y-2">
                  {day.blocks.map((block) => {
                    const status = statusOf(state, block, date, today);
                    const mirror = block.link === null ? undefined : store.mirrors.find((entry) => entry.blockId === block.id && entry.date === date);
                    const statusId = `routine-status-${date}-${block.id}`;
                    return (
                      <li key={block.id} className="min-w-0 rounded-lg border border-border/70 bg-background p-2">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] tabular-nums text-muted-foreground">{block.start}–{block.end}</p>
                            <p className="break-words text-xs font-medium text-foreground">{block.title}</p>
                          </div>
                          {block.link === null ? null : <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] capitalize text-muted-foreground">{block.link.kind}</span>}
                        </div>
                        <label className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                          <span>{t("routine.state")}</span>
                          <select
                            id={statusId}
                            aria-label={t("routine.blockStateOnDate", { title: block.title, date })}
                            className="min-h-8 max-w-[110px] rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                            disabled={cannotRecord}
                            value={status}
                            onChange={(event) => void store.setOccurrence(block.id, date, { status: event.target.value as BlockStatus })}
                          >
                            {statuses.map((option) => <option key={option} value={option}>{t(`routine.${option}`)}</option>)}
                          </select>
                        </label>
                        {mirror === undefined ? null : mirror.reason === "target_missing" ? (
                          <p className="mt-2 text-[10px] text-muted-foreground">{t("routine.targetMissing")}</p>
                        ) : mirror.reason === "no_completed_column" ? (
                          <p className="mt-2 text-[10px] text-muted-foreground">{t("routine.noCompletedColumn")}</p>
                        ) : mirror.reason === "mirror_failed" ? (
                          <p className="mt-2 text-[10px] text-muted-foreground">{t("routine.mirrorFailed")}</p>
                        ) : (
                          <p className="mt-2 text-[10px] text-muted-foreground">{t(mirror.written ? "routine.linkUpdated" : "routine.linkNotWritten")}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
