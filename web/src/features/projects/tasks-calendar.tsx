import { useEffect, useMemo, useState } from "react";
import {
  CalendarBody,
  CalendarDate,
  CalendarDatePagination,
  CalendarDatePicker,
  CalendarHeader,
  CalendarMonthPicker,
  CalendarProvider,
  CalendarYearPicker,
  useCalendarMonth,
  useCalendarYear,
  type Feature,
} from "@/components/kibo-ui/calendar";
import { fetchCalendarTasks, type CalendarTask } from "./projects-api";
import { isOverdue } from "./due";
import { useT } from "@/i18n";

type TasksCalendarProps = {
  /** `null` shows the tasks of every project; an id narrows the month to one project. */
  projectId?: string | null;
  onOpenTask?: (task: CalendarTask) => void;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The month view of everything that is due.
 *
 * The grid is Kibo UI's calendar, so a task lands on the day it is due and the month is navigated with
 * the same header the component ships. A task is drawn as a chip whose dot carries the only colour in
 * the section that means something: ink for a task still to do, muted for one that is finished, and the
 * destructive red for one whose day has passed.
 */
export function TasksCalendar({ projectId = null, onOpenTask }: TasksCalendarProps) {
  const { locale, t } = useT();
  const [month] = useCalendarMonth();
  const [year] = useCalendarYear();
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [loading, setLoading] = useState(true);

  const from = `${year}-${pad(month + 1)}-01`;
  // Day zero of the following month is the last day of this one.
  const to = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCalendarTasks(from, to)
      .then((next) => {
        if (cancelled) return;
        setTasks(projectId === null ? next : next.filter((task) => task.projectId === projectId));
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, projectId]);

  const features = useMemo<Feature[]>(
    () =>
      tasks.map((task) => {
        const [taskYear, taskMonth, taskDay] = task.dueDate.split("-").map(Number);
        const due = new Date(taskYear, taskMonth - 1, taskDay, 12);
        return {
          id: task.id,
          name: task.title,
          startAt: due,
          endAt: due,
          status: {
            id: task.columnId,
            name: task.columnName,
            color: task.isCompleted
              ? "var(--muted-foreground)"
              : isOverdue(task.dueDate, task.isCompleted)
                ? "var(--destructive)"
                : "var(--foreground)",
          },
        };
      }),
    [tasks],
  );

  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  return (
    <div className="w-full max-w-[46rem]">
      <CalendarProvider locale={locale} startDay={1}>
        <CalendarDate>
          <CalendarDatePicker>
            <CalendarMonthPicker />
            <CalendarYearPicker start={year - 4} end={year + 4} />
          </CalendarDatePicker>
          <CalendarDatePagination />
        </CalendarDate>

        <CalendarHeader />

        <CalendarBody features={features}>
          {({ feature }) => {
            const task = byId.get(feature.id);
            return (
              <button
                key={feature.id}
                type="button"
                onClick={() => {
                  if (task !== undefined && onOpenTask !== undefined) onOpenTask(task);
                }}
                className="flex w-full min-w-0 items-center gap-1.5 rounded-[3px] px-1 py-0.5 text-left text-[11px] leading-tight text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: feature.status.color }}
                />
                <span className="truncate">{feature.name}</span>
              </button>
            );
          }}
        </CalendarBody>
      </CalendarProvider>

      {loading ? <p className="mt-3 text-xs text-muted-foreground">{t("projects.loadingMonth")}</p> : null}
    </div>
  );
}
