import { useMemo } from "react";
import {
  MiniCalendar,
  MiniCalendarDays,
  MiniCalendarNavigation,
  useMiniCalendar,
} from "@/components/kibo-ui/mini-calendar";
import { Button } from "@/components/ui/button";
import { addDays, dayKeyOf, weekStartKey, type DayKey } from "@/features/habits/date";
import { dayLevel } from "@/features/habits/level";
import type { Habit, HabitEntry } from "@/features/habits/habits-api";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

/** The window is a whole week, the same span the habits week grid covers. */
const DAYS_IN_WINDOW = 7;

/** A local-noon Date, so no conversion can slide the day onto a neighbouring one. */
function localDate(key: DayKey): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

/**
 * The name a chip is read by. The reading state is part of the name, because the dot that carries it is a
 * pseudo-element and never reaches the accessibility tree on its own.
 */
function chipLabel(
  day: DayKey,
  isToday: boolean,
  logged: boolean,
  weekdayLongFormat: Intl.DateTimeFormat,
  dayFormat: Intl.DateTimeFormat,
  t: (key: string) => string,
): string {
  const date = localDate(day);
  const parts = [`${weekdayLongFormat.format(date)}, ${dayFormat.format(date)}`];
  if (isToday) parts.push(t("books.today"));
  if (logged) parts.push(t("books.readingLogged"));
  return parts.join(", ");
}

type ReadingCalendarProps = {
  habit: Habit;
  entries: HabitEntry[];
  today: DayKey;
  /** The day the detail panel below edits. */
  selectedDay: DayKey;
  /** The first day the user may reach. */
  from: DayKey;
  onSelectDay: (day: DayKey) => void;
};

/**
 * The reading log's day picker: a Kibo mini-calendar, one week wide.
 *
 * It replaces the week grid and the day switcher the habits section uses, and it does the same job in one
 * control: the week the selected day belongs to, as a strip of chips that carry the reading state, and the
 * detail panel below still edits the selected day.
 *
 * The strip keeps the habits' own reading definition: a day is logged when the habit's trackable fields are
 * satisfied, read through `dayLevel`, so a chip says the same thing the heatmap above it says.
 */
export function ReadingCalendar({
  habit,
  entries,
  today,
  selectedDay,
  from,
  onSelectDay,
}: ReadingCalendarProps) {
  const { t, locale } = useT();
  const weekdayLongFormat = new Intl.DateTimeFormat(locale, { weekday: "long" });
  const dayFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const weekStart = weekStartKey(selectedDay);

  const visibleDays = useMemo(
    () => Array.from({ length: DAYS_IN_WINDOW }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const loggedDays = useMemo(() => {
    const days = new Set<DayKey>();
    for (const day of visibleDays) {
      if (dayLevel(habit, day, entries) > 0) days.add(day);
    }
    return days;
  }, [habit, entries, visibleDays]);

  // The window never reaches back before the first selectable day, so the entries read stays bounded.
  const canGoBack = addDays(weekStart, -DAYS_IN_WINDOW) >= from;

  const handleSelect = (date: Date | undefined) => {
    if (date === undefined) return;
    onSelectDay(dayKeyOf(date));
  };

  return (
    <section aria-label={t("books.readingLogLabel")} className="flex flex-col gap-2">
      <MiniCalendar
        value={localDate(selectedDay)}
        onValueChange={handleSelect}
        startDate={localDate(weekStart)}
        onStartDateChange={handleSelect}
        days={DAYS_IN_WINDOW}
        className="max-w-full gap-1 overflow-x-auto rounded-none border-0 bg-transparent p-0"
      >
        <MiniCalendarNavigation direction="prev" aria-label={t("books.previousWeek")} disabled={!canGoBack} className="size-8 shrink-0 [@media(hover:none)]:size-11" />
        <MiniCalendarDayChips
          today={today}
          selectedDay={selectedDay}
          from={from}
          loggedDays={loggedDays}
          weekdayFormat={weekdayFormat}
          weekdayLongFormat={weekdayLongFormat}
          dayFormat={dayFormat}
          t={t}
        />
        <MiniCalendarNavigation direction="next" aria-label={t("books.nextWeek")} className="size-8 shrink-0 [@media(hover:none)]:size-11" />
      </MiniCalendar>
    </section>
  );
}

type MiniCalendarDayChipsProps = {
  today: DayKey;
  selectedDay: DayKey;
  /** The first day the user may reach. */
  from: DayKey;
  loggedDays: Set<DayKey>;
  weekdayFormat: Intl.DateTimeFormat;
  weekdayLongFormat: Intl.DateTimeFormat;
  dayFormat: Intl.DateTimeFormat;
  t: (key: string) => string;
};

/**
 * The chips of the strip.
 *
 * The upstream chip labels every day with its month, which is what a picker that straddles a month boundary
 * needs. A week strip does not: the heatmap above already says which month this is, and what a reader needs
 * to know is the day of the week. So the chip is drawn here instead, on the project's own button.
 */
function MiniCalendarDayChips({
  today,
  selectedDay,
  from,
  loggedDays,
  weekdayFormat,
  weekdayLongFormat,
  dayFormat,
  t,
}: MiniCalendarDayChipsProps) {
  const { onDateSelect } = useMiniCalendar();

  return (
    <MiniCalendarDays>
      {(date) => {
        const day = dayKeyOf(date);
        const logged = loggedDays.has(day);
        const isToday = day === today;
        const isSelected = day === selectedDay;
        return (
          <Button
            key={day}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDateSelect(date)}
            aria-current={isSelected ? "date" : undefined}
            aria-label={chipLabel(day, isToday, logged, weekdayLongFormat, dayFormat, t)}
            disabled={day < from}
            className={cn(
              "relative h-auto min-h-11 w-8 min-w-8 flex-col gap-0 rounded-md px-0 py-2 text-xs transition-colors duration-150 motion-reduce:transition-none",
              isSelected && "bg-muted text-foreground",
              isToday && !isSelected && "ring-1 ring-inset ring-foreground/30",
              // A day that has not happened yet is visible but dim, the way the habits week grid shows it.
              day > today && "opacity-60",
              "[@media(hover:none)]:min-h-11",
              // The reading state is one dot under the day. The selected day is the only full-strength
              // accent in the strip, so a logged day never competes with it.
              logged &&
                "after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
            )}
          >
            <span
              className={cn(
                "font-medium text-[10px] text-muted-foreground",
                isSelected && "text-primary-foreground/70"
              )}
            >
              {weekdayFormat.format(date)}
            </span>
            <span className="font-semibold text-sm">{date.getDate()}</span>
          </Button>
        );
      }}
    </MiniCalendarDays>
  );
}
