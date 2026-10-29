import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraphHeatmap } from "@/components/mdxcn/graph-heatmap";
import { intensityClass, intensityGlyph } from "@/components/mdxcn/graph-frame/graph-motion";
import { cn } from "@/lib/utils";
import { addDays, dayKeysBetween, daysInMonth, monthBounds, monthKeyOf, parseDayKey, shiftMonth, weekStartKey } from "./date";
import type { DayKey } from "./date";
import { dayLevel } from "./level";
import type { Habit, HabitEntry } from "./habits-api";

export type HabitPeriod = "month" | "quarter" | "year";
export type HabitHistoryView = "mono" | "activity";

type HabitMatrixProps = {
  habits: Habit[];
  entries: HabitEntry[];
  period: HabitPeriod;
  /** Any day inside the window; the window ends with the week this day belongs to. */
  anchor: DayKey;
  /** The user's local today, so a week in progress is not averaged against days that have not happened. */
  today: DayKey;
  onPeriodChange: (period: HabitPeriod) => void;
  onAnchorChange: (anchor: DayKey) => void;
  view?: HabitHistoryView;
  onViewChange?: (view: HabitHistoryView) => void;
  /** The graph frame's own title; the habits section calls it "Habit history", books calls it "Reading". */
  title?: string;
  /** The panel heading, so a sibling section can name the same view for its own domain. */
  heading?: string;
};

export type MatrixColumn = { key: DayKey; label: string; days: DayKey[] };

const intensityLevels = [0, 1, 2, 3, 4];

/** A local-noon Date, so no conversion can slide the day onto a neighbouring one. */
function localDate(key: DayKey): Date {
  const { year, month, day } = parseDayKey(key);
  return new Date(year, month - 1, day, 12);
}

/**
 * The visible window. A month is that calendar month; a quarter and a year are the trailing 13 and 52 weeks that end
 * with the anchor's own week, because a calendar year would spend half its columns on days that have not happened yet.
 */
export function habitWindow(anchor: DayKey, period: HabitPeriod): { from: DayKey; to: DayKey } {
  if (period === "month") return monthBounds(monthKeyOf(anchor));

  const weeks = period === "quarter" ? 13 : 52;
  const lastWeek = weekStartKey(anchor);
  return { from: addDays(lastWeek, -7 * (weeks - 1)), to: addDays(lastWeek, 6) };
}

export function columnsFor(anchor: DayKey, period: HabitPeriod, locale = "en-US"): MatrixColumn[] {
  const monthShortFormat = new Intl.DateTimeFormat(locale, { month: "short" });
  if (period === "month") {
    return daysInMonth(monthKeyOf(anchor)).map((day) => {
      const dayOfMonth = Number(day.slice(8, 10));
      // A whole month of two-digit labels truncates into noise at this width, so only every fifth day is named.
      const label = dayOfMonth === 1 || dayOfMonth % 5 === 0 ? String(dayOfMonth) : "";
      return { key: day, label, days: [day] };
    });
  }

  const { from, to } = habitWindow(anchor, period);
  const weeks: MatrixColumn[] = [];

  for (const weekStart of dayKeysBetween(from, to).filter((_, index) => index % 7 === 0)) {
    const days = dayKeysBetween(weekStart, addDays(weekStart, 6));
    // Only the week holding the first of a month is labelled: 52 two-character labels would collide.
    const named = days.find((day) => day.endsWith("-01"));
    weeks.push({ key: weekStart, label: named === undefined ? "" : monthShortFormat.format(localDate(named)), days });
  }

  return weeks;
}

export function captionFor(anchor: DayKey, period: HabitPeriod, locale = "en-US"): string {
  const { from, to } = habitWindow(anchor, period);
  const monthFormat = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const dayFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  if (period === "month") return monthFormat.format(localDate(from));
  return `${dayFormat.format(localDate(from))} – ${dayFormat.format(localDate(to))}`;
}

export function shiftAnchor(anchor: DayKey, period: HabitPeriod, direction: -1 | 1): DayKey {
  const months = period === "month" ? 1 : period === "quarter" ? 3 : 12;
  const targetDays = daysInMonth(shiftMonth(monthKeyOf(anchor), months * direction));
  // Clamp the day: the 31st has no counterpart in a shorter month.
  return targetDays[Math.min(Number(anchor.slice(8, 10)), targetDays.length) - 1]!;
}

/** The rounded average level of the days of a week that have already happened. */
export function weekLevel(habit: Habit, days: DayKey[], entries: HabitEntry[], today: DayKey): number {
  const elapsed = days.filter((day) => day <= today);
  if (elapsed.length === 0) return 0;

  const total = elapsed.reduce((sum, day) => sum + dayLevel(habit, day, entries), 0);
  return Math.round(total / elapsed.length);
}

export function HabitMatrix({ habits, entries, period, anchor, today, onPeriodChange, onAnchorChange, view = "mono", onViewChange, title, heading }: HabitMatrixProps) {
  const { locale, t } = useT();
  const matrixTitle = title ?? t("habits.history");
  const matrixHeading = heading ?? t("habits.consistency");
  const dayFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const columns = columnsFor(anchor, period, locale);
  const rows = habits.map((habit) => ({
    label: habit.name,
    values: columns.map(({ days }) =>
      period === "month" ? dayLevel(habit, days[0]!, entries) : weekLevel(habit, days, entries, today)
    ),
  }));

  const activity = columns.map((column) => {
    const elapsed = column.days.filter((day) => day <= today);
    const completed = elapsed.reduce(
      (sum, day) => sum + habits.filter((habit) => dayLevel(habit, day, entries) > 0).length,
      0,
    );
    const samples = elapsed.length * habits.length;
    const level = samples === 0 ? 0 : Math.round(
      elapsed.reduce((sum, day) => sum + habits.reduce((habitSum, habit) => habitSum + dayLevel(habit, day, entries), 0), 0) / samples,
    );
    const label = period === "month"
      ? dayFormat.format(localDate(column.key))
      : t("habits.weekOf", { date: dayFormat.format(localDate(column.key)) });
    return { key: column.key, label, completed, samples, level };
  });

  if (matrixTitle !== t("habits.history")) {
    return (
      <section className="flex min-w-0 flex-col gap-4" aria-label={matrixTitle}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label={t("habits.previousPeriod")} onClick={() => onAnchorChange(shiftAnchor(anchor, period, -1))}><ChevronLeft aria-hidden="true" /></Button>
            <Button variant="ghost" size="icon" aria-label={t("habits.nextPeriod")} onClick={() => onAnchorChange(shiftAnchor(anchor, period, 1))}><ChevronRight aria-hidden="true" /></Button>
            <p className="ml-2 text-sm font-medium text-foreground" aria-live="polite">{captionFor(anchor, period, locale)}</p>
          </div>
          <Select value={period} onValueChange={(value) => value && onPeriodChange(value as HabitPeriod)}>
            <SelectTrigger aria-label={t("habits.period")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">{t("habits.month")}</SelectItem>
              <SelectItem value="quarter">{t("habits.quarter")}</SelectItem>
              <SelectItem value="year">{t("habits.year")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <GraphHeatmap title={matrixTitle} columns={columns.map((column, index) => column.label || "\u200b".repeat(index + 1))} rows={rows} max={4} glyphs="shade" palette="mono" className="min-h-[15rem] min-w-0" legend={false} />
        <p className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>{t("habits.less")}</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            {intensityLevels.map((level) => <span key={level} className={cn("leading-none select-none", intensityClass(level, "mono"))}>{intensityGlyph(level)}</span>)}
          </span>
          <span>{t("habits.more")}</span>
        </p>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={matrixHeading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-muted-foreground">{heading}</h2>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div role="group" aria-label={t("habits.historyPeriod")} className="inline-flex items-center gap-0.5">
            {(["month", "quarter", "year"] as const).map((value) => (
              <Button key={value} type="button" variant="ghost" aria-pressed={period === value} onClick={() => onPeriodChange(value)} className={cn("h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none", period === value && "bg-muted text-foreground")}>
                {value === "month" ? t("habits.month") : value === "quarter" ? t("habits.quarter") : t("habits.year")}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon" aria-label={t("habits.previousPeriod")} onClick={() => onAnchorChange(shiftAnchor(anchor, period, -1))} className="size-8"><ChevronLeft aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={t("habits.nextPeriod")} onClick={() => onAnchorChange(shiftAnchor(anchor, period, 1))} className="size-8"><ChevronRight aria-hidden="true" /></Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground" aria-live="polite">{captionFor(anchor, period, locale)}</p>
        <div role="group" aria-label={t("habits.history")} className="inline-flex items-center gap-0.5">
          <Button type="button" variant="ghost" aria-pressed={view === "mono"} onClick={() => onViewChange?.("mono")} className={cn("h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none", view === "mono" && "bg-muted text-foreground")}>{t("habits.mono")}</Button>
          <Button type="button" variant="ghost" aria-pressed={view === "activity"} onClick={() => onViewChange?.("activity")} className={cn("h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none", view === "activity" && "bg-muted text-foreground")}>{t("habits.activity")}</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground lg:hidden">{t("habits.scrollHistory")}</p>
      <div role="region" aria-label={t("habits.scrollableHistory")} tabIndex={0} className="min-w-0 overflow-x-auto rounded-lg border border-border/70 p-3">
        {view === "mono" ? (
          <div className="min-w-[700px]">
            <GraphHeatmap
              title=""
              columns={columns.map((column, index) => column.label || "\u200b".repeat(index + 1))}
              rows={rows}
              max={4}
              glyphs="shade"
              palette="mono"
              className="min-h-[15rem] min-w-0"
              legend={false}
            />
          </div>
        ) : (
          <ul aria-label={t("habits.activityByDay")} role="list" className="grid min-w-[760px] gap-1" style={{ gridTemplateColumns: `repeat(${activity.length}, minmax(0, 1fr))` }}>
            {activity.map((item) => (
              <li key={item.key} aria-label={t("habits.completedActivity", { label: item.label, completed: item.completed, samples: item.samples, unit: t(period === "month" ? "habits.habits" : "habits.habitDays") })} className="flex min-w-0 flex-col items-center gap-2 text-center">
                <span className="h-4 text-[10px] text-muted-foreground">{columns.find((column) => column.key === item.key)?.label}</span>
                <span aria-hidden="true" title={t("habits.completedActivity", { label: item.label, completed: item.completed, samples: item.samples, unit: t("habits.habitDays") })} className={cn("text-center leading-none select-none", intensityClass(item.level, "mono"))}>{intensityGlyph(item.level)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="flex items-center justify-end gap-2 text-xs text-muted-foreground" aria-label={t("habits.activityLegend")}>
        <span>{t("habits.less")}</span>
        <span className="flex items-center gap-2" aria-hidden="true">
          {intensityLevels.map((level) => <span key={level} className={cn("leading-none select-none", intensityClass(level, "mono"))}>{intensityGlyph(level)}</span>)}
        </span>
        <span>{t("habits.more")}</span>
      </p>
    </section>
  );
}
