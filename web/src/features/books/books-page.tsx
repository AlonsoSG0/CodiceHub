import { useCallback, useEffect, useMemo, useState } from "react";
import { House, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { HabitMatrix, habitWindow } from "@/features/habits/habit-matrix";
import type { HabitHistoryView, HabitPeriod } from "@/features/habits/habit-matrix";
import { CheckInPanel } from "@/features/habits/check-in-panel";
import {
  addHabitField,
  createHabit,
  fetchHabitEntries,
  fetchHabits,
  setHabitEntries,
  type Habit,
  type HabitEntry,
  type HabitValueInput,
} from "@/features/habits/habits-api";
import { addDays, todayKey, weekStartKey, type DayKey } from "@/features/habits/date";
import { currentStreak } from "@/features/habits/level";
import {
  currentValue,
  usePreference,
  whenWorkspacePreferencesLoaded,
  workspacePreferencesStatus,
} from "@/features/settings/preferences";
import { BookCard } from "./book-card";
import { BookDialog } from "./book-dialog";
import { ReadingCalendar } from "./reading-calendar";
import { createBook, createBookNotebook, fetchBooks, updateBook, deleteBook, type Book, type BookStatus } from "./books-api";

async function ensureReadingHabit(name: string, mayCreate = true): Promise<Habit> {
  // The reading habit is created in the books section, which marks Books as its owner; /habits lists it like any
  // other habit, so recording it from either surface writes the same entries.
  const habits = await fetchHabits({ section: "books" });
  const existing = habits.find((habit) => habit.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  // Creating a habit writes to SQLite, so it is never done on a guessed name: when the workspace preference
  // could not be read, an existing books habit is reused and, with none available, the page surfaces the error.
  if (!mayCreate) {
    const anyReadingHabit = habits[0];
    if (anyReadingHabit) return anyReadingHabit;
    throw new Error("reading_habit_unavailable");
  }

  const created = await createHabit({ name, section: "books" });
  // create() auto-adds a "Done" check field; add Minutes (number) and Pages (text).
  await addHabitField(created.id, { kind: "number", label: "Minutes", unit: "min", position: 1 });
  await addHabitField(created.id, { kind: "text", label: "Pages", position: 2 });
  return fetchHabits({ section: "books" }).then((list) => list.find((habit) => habit.id === created.id)!);
}

const bookStatuses: Array<{ value: BookStatus | "all"; key: string }> = [
  { value: "all", key: "books.all" },
  { value: "reading", key: "books.reading" },
  { value: "completed", key: "books.completed" },
  { value: "wishlist", key: "books.wishlist" },
  { value: "abandoned", key: "books.abandoned" },
];

export function BooksPage() {
  const { t } = useT();
  const [today] = useState<DayKey>(() => todayKey());
  const [anchor, setAnchor] = useState<DayKey>(() => todayKey());
  const [period, setPeriod] = useState<HabitPeriod>("month");
  const [historyView, setHistoryView] = useState<HabitHistoryView>("mono");
  const [selectedDay, setSelectedDay] = useState<DayKey>(() => todayKey());
  const [habit, setHabit] = useState<Habit | null>(null);
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<BookStatus | "all">("all");
  const [readingHabitName] = usePreference("modules.readingHabit");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const navigate = useNavigate();

  const window = useMemo(() => habitWindow(anchor, period), [anchor, period]);
  // Load the visible history, the reachable log window, and a year of entries for the current-streak stat.
  const range = useMemo(() => {
    const selectedWeek = weekStartKey(selectedDay);
    const streakStart = addDays(today, -364);
    const from = [window.from, selectedWeek, streakStart].filter((day) => day < today).sort()[0] ?? today;
    return { from, to: today };
  }, [today, window, selectedDay]);
  const windowEntries = useMemo(
    () => entries.filter((entry) => entry.date >= window.from && entry.date <= window.to),
    [entries, window],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const habitForPage = () =>
      whenWorkspacePreferencesLoaded().then(() => {
        const preferred = currentValue("modules.readingHabit");
        const name = typeof preferred === "string" && preferred.trim() ? preferred : "Reading";
        return ensureReadingHabit(name, workspacePreferencesStatus() !== "failed");
      });
    Promise.all([habitForPage(), fetchBooks(), fetchHabitEntries({ from: range.from, to: range.to })])
      .then(([nextHabit, nextBooks, nextEntries]) => {
        if (cancelled) return;
        setHabit(nextHabit);
        setBooks(nextBooks);
        setEntries(nextEntries);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setLoadError(failure instanceof Error ? failure.message : "unknown_error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The two range ends, not the object: moving the selected day inside the same week must not refetch.
  }, [range.from, range.to, reload, readingHabitName]);

  const handleSetValues = useCallback(
    async (habitId: string, date: DayKey, values: HabitValueInput[]) => {
      const next = await setHabitEntries(habitId, date, values);
      setEntries((current) => {
        const written = new Set(values.map((value) => value.fieldId));
        return [
          ...current.filter(
            (entry) => !(entry.habitId === habitId && entry.date === date && written.has(entry.fieldId)),
          ),
          ...next,
        ];
      });
    },
    [],
  );

  const openCreate = () => {
    setEditing(null);
    setActionError(null);
    setDialogOpen(true);
  };

  const openEdit = (book: Book) => {
    setEditing(book);
    setActionError(null);
    setDialogOpen(true);
  };

  /** The notebook is created on the spot, so the button never lands on a missing page. */
  const openNotebook = async (book: Book) => {
    try {
      await createBookNotebook(book.id);
      navigate(`/books/${book.id}/notebook`);
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "unknown_error");
    }
  };

  const handleSave = async (draft: Book | null) => {
    if (draft === null) return;
    const { id, createdAt, updatedAt, ...fields } = draft;
    if (editing === null) {
      const created = await createBook(fields);
      setBooks((current) => [...current, created]);
      return;
    }
    const updated = await updateBook(editing.id, fields);
    setBooks((current) => current.map((book) => (book.id === updated.id ? updated : book)));
  };

  const handleDelete = async (book: Book) => {
    await deleteBook(book.id);
    setBooks((current) => current.filter((item) => item.id !== book.id));
    setDialogOpen(false);
  };

  const retryLoad = () => {
    setActionError(null);
    setReload((current) => current + 1);
  };

  const counts = useMemo(() => ({
    all: books.length,
    reading: books.filter((book) => book.status === "reading").length,
    completed: books.filter((book) => book.status === "completed").length,
    wishlist: books.filter((book) => book.status === "wishlist").length,
    abandoned: books.filter((book) => book.status === "abandoned").length,
  }), [books]);
  const visibleBooks = useMemo(
    () => filter === "all" ? books : books.filter((book) => book.status === filter),
    [books, filter],
  );
  const year = today.slice(0, 4);
  const finishedThisYear = books.filter(
    (book) => book.status === "completed" && book.completedDate !== null && book.completedDate >= `${year}-01-01` && book.completedDate <= today,
  ).length;
  const readingNow = counts.reading;
  const readingStreak = habit === null ? 0 : currentStreak(habit, today, entries);
  const readingSummary = t("books.readingSummary", { total: books.length, finished: finishedThisYear });

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 sm:gap-7 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            aria-label={t("books.homeLink")}
            title={t("books.homeTitleLink")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
          >
            <House className="size-4" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("books.titlePage")}</h1>
            <p className="text-[13px] text-muted-foreground">
              {loading || loadError !== null ? t("books.subtitle") : readingSummary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="[&>button]:size-9">
            <ThemeToggle />
          </div>
          <div className="[&>button]:size-9"><LanguageToggle />
          </div>
          <Button type="button" variant="outline" onClick={openCreate} className="h-9 gap-1.5 px-3 text-sm">
            <Plus className="size-4" aria-hidden="true" />
            {t("books.add")}
          </Button>
        </div>
      </header>

      {actionError === null ? null : (
        <p role="alert" className="border-y border-destructive/30 py-3 text-sm text-destructive">{actionError}</p>
      )}

      {loading ? <LoadingSkeleton label={t("books.loading")} className="min-h-32" /> : null}

      {loadError === null || loading ? null : (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-y border-destructive/30 py-3 text-sm text-destructive">
          <span>{loadError}</span>
          <Button type="button" variant="ghost" onClick={retryLoad} className="h-9 text-destructive hover:text-destructive">
            {t("books.retry")}
          </Button>
        </div>
      )}

      {!loading && loadError === null ? (
        <>
          <section aria-label={t("books.summary")} className="grid gap-4 border-y border-border py-4 sm:grid-cols-3 sm:divide-x sm:divide-border sm:gap-0">
            <div className="min-w-0 space-y-1 sm:pr-6">
              <p className="text-[13px] text-muted-foreground">{t("books.readingNow")}</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{readingNow} <span className="text-sm font-normal text-muted-foreground">{t(readingNow === 1 ? "books.book" : "books.books")}</span></p>
            </div>
            <div className="min-w-0 space-y-1 sm:px-6">
              <p className="text-[13px] text-muted-foreground">{t("books.finished", { year })}</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{finishedThisYear} <span className="text-sm font-normal text-muted-foreground">{t(finishedThisYear === 1 ? "books.book" : "books.books")}</span></p>
            </div>
            <div className="min-w-0 space-y-1 sm:pl-6">
              <p className="text-[13px] text-muted-foreground">{t("books.readingStreak")}</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{readingStreak} <span className="text-sm font-normal text-muted-foreground">{t(readingStreak === 1 ? "books.day" : "books.days")}</span></p>
            </div>
          </section>

          {habit ? (
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-7">
              <div className="order-last min-w-0 lg:order-none">
                {windowEntries.length === 0 ? <p className="mb-2 text-xs text-muted-foreground">{t("books.noHistory")}</p> : null}
                <HabitMatrix
                  heading={t("books.readingHistory")}
                  habits={[habit]}
                  entries={windowEntries}
                  period={period}
                  anchor={anchor}
                  today={today}
                  view={historyView}
                  onPeriodChange={setPeriod}
                  onAnchorChange={setAnchor}
                  onViewChange={setHistoryView}
                />
              </div>

              <section className="order-first min-w-0 border-b border-border pb-5 lg:sticky lg:top-6 lg:order-none lg:border-b-0 lg:border-l lg:border-border lg:pl-6 lg:pb-0">
                <h2 className="mb-4 text-[13px] font-medium text-muted-foreground">{t("books.readingLog")}</h2>
                <CheckInPanel
                  habits={[habit]}
                  entries={entries}
                  today={today}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                  onSetValues={handleSetValues}
                  dayPicker={(state) => (
                    <div className="space-y-2">
                      <ReadingCalendar
                        habit={habit}
                        entries={state.entries}
                        today={state.today}
                        selectedDay={state.selectedDay}
                        from={state.from}
                        onSelectDay={state.onSelectDay}
                      />
                      {!state.entries.some((entry) => entry.date === state.selectedDay) ? (
                        <p className="text-xs text-muted-foreground">{t("books.nothingLogged")}</p>
                      ) : null}
                    </div>
                  )}
                />
              </section>
            </div>
          ) : null}

          <section aria-label={t("books.library")} className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">{t("books.library")}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{t("books.shownCount", { shown: visibleBooks.length, total: books.length, books: t(books.length === 1 ? "books.book" : "books.books") })}</span>
            </div>

            <div role="group" aria-label={t("books.filter")} className="flex flex-wrap items-center gap-1">
              {bookStatuses.map(({ value, key }) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "h-8 rounded-md px-2.5 text-xs transition-colors duration-150 motion-reduce:transition-none",
                    filter === value ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  {t(key)} <span className="tabular-nums">{counts[value]}</span>
                </Button>
              ))}
            </div>

            {books.length === 0 ? (
              <div className="flex flex-col items-start gap-3 py-6">
                <p className="text-sm text-muted-foreground">{t("books.noBooks")}</p>
                <Button type="button" variant="outline" onClick={openCreate} className="h-9 gap-1.5 px-3 text-sm">
                  <Plus className="size-4" aria-hidden="true" />
                  {t("books.addFirst")}
                </Button>
              </div>
            ) : visibleBooks.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">{t("books.noStatus")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleBooks.map((book) => (
                  <BookCard key={book.id} book={book} onSelect={openEdit} onOpenNotebook={openNotebook} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      <BookDialog
        open={dialogOpen}
        book={editing}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </main>
  );
}
