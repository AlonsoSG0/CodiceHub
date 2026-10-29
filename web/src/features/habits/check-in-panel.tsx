import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDays, weekStartKey, type DayKey } from "./date";
import { TodayStrip } from "./today-strip";
import type { Habit, HabitEntry, HabitValueInput } from "./habits-api";

/** What a custom day picker needs to draw itself: the panel's own state and its bounds. */
export type DayPickerState = {
  today: DayKey;
  /** The day the detail panel edits. */
  selectedDay: DayKey;
  /** The first day the user may select. */
  from: DayKey;
  habits: Habit[];
  entries: HabitEntry[];
  onSelectDay: (day: DayKey) => void;
};

type CheckInPanelProps = {
  habits: Habit[];
  entries: HabitEntry[];
  today: DayKey;
  /** The day the detail panel edits. */
  selectedDay: DayKey;
  onSelectDay: (day: DayKey) => void;
  onSetValues: (habitId: string, date: DayKey, values: HabitValueInput[]) => Promise<unknown>;
  onEditHabit?: (habitId: string) => void;
  /**
   * A different day picker, replacing the week grid and the day switcher with a single control. The habits
   * section uses the built-in ones; books passes a mini-calendar that shows the week and its reading state.
   */
  dayPicker?: (state: DayPickerState) => ReactNode;
};

/**
 * The registration surface: the week grid on top, and the detail of the selected day below it.
 *
 * The grid is the fast path — a click marks a habit on any day of the week. The day switcher moves the
 * detail panel, which is where the numeric and written fields of a single day are recorded. A day that has
 * not happened yet can be reached and looked at, but nothing about it can be recorded.
 */
export function CheckInPanel({
  habits,
  entries,
  today,
  selectedDay,
  onSelectDay,
  onSetValues,
  onEditHabit,
  dayPicker,
}: CheckInPanelProps) {
  // The last line of defence: even if a control slipped through, a day that has not happened is never written.
  const writeValues = (habitId: string, date: DayKey, values: HabitValueInput[]) => {
    if (date > today) return Promise.reject(new Error(t("habits.unrecordable")));
    return onSetValues(habitId, date, values);
  };
  const { locale, t } = useT();
  const lastReachableDay = addDays(today, 1);
  const firstReachableDay = addDays(today, -90);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStartKey(selectedDay), index));
  const selectedDate = new Date(Number(selectedDay.slice(0, 4)), Number(selectedDay.slice(5, 7)) - 1, Number(selectedDay.slice(8, 10)), 12);
  const selectedLabel = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(selectedDate);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const dayOfMonth = new Intl.DateTimeFormat(locale, { day: "numeric" });
  const localDate = (key: DayKey) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12);

  return (
    <section aria-label={t("habits.todayCheckins")} className="min-w-0 space-y-4">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold text-foreground">{dayPicker === undefined ? selectedLabel : t("habits.dayDetail")}</h3>
          {selectedDay === today ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{t("habits.today")}</span> : null}
        </div>
        {dayPicker === undefined ? (
          <div className="flex items-center gap-1">
            {selectedDay !== today ? <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onSelectDay(today)}>{t("habits.backToday")}</Button> : null}
            <Button type="button" variant="ghost" size="icon" aria-label={t("habits.previousDay")} disabled={selectedDay <= firstReachableDay} onClick={() => onSelectDay(addDays(selectedDay, -1))} className="size-8">
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={t("habits.nextDay")} disabled={selectedDay >= lastReachableDay} onClick={() => onSelectDay(addDays(selectedDay, 1))} className="size-8">
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </header>

      {dayPicker === undefined ? (
        <div className="overflow-x-auto pb-1" aria-label={t("habits.sevenDayStrip")}>
          <div className="flex min-w-max gap-2">
            {days.map((day) => {
              const isToday = day === today;
              const isSelected = day === selectedDay;
              const isFuture = day > today;
              const date = localDate(day);
              const label = `${weekday.format(date)}, ${new Intl.DateTimeFormat(locale, { month: "short" }).format(date)} ${dayOfMonth.format(date)}`;
              return (
                <Button
                  key={day}
                  type="button"
                  variant="ghost"
                  aria-label={label}
                  aria-current={isSelected ? "date" : undefined}
                  disabled={isFuture}
                  onClick={() => onSelectDay(day)}
                  className={cn(
                    "flex size-10 shrink-0 flex-col gap-0 rounded-md p-0 text-[11px] text-muted-foreground transition-colors duration-150 motion-reduce:transition-none",
                    isSelected && "bg-foreground/10 text-foreground",
                    isToday && !isSelected && "text-foreground ring-1 ring-inset ring-foreground/30",
                    isFuture && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span>{weekday.format(date).slice(0, 1)}</span>
                  <span className="font-semibold tabular-nums">{day.slice(8, 10)}</span>
                </Button>
              );
            })}
          </div>
        </div>
      ) : dayPicker({ today, selectedDay, from: firstReachableDay, habits, entries, onSelectDay })}

      <TodayStrip habits={habits} entries={entries} day={selectedDay} today={today} onSetValues={writeValues} onEditHabit={onEditHabit} />
    </section>
  );
}
