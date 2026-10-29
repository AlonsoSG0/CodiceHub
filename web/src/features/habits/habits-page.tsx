import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ChevronDown, Flame, House, MoreHorizontal, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBackdrop,
  DialogBody,
  DialogCloseIcon,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/i18n";
import { usePreference } from "@/features/settings/preferences";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { HabitEditor } from "./habit-editor";
import { HabitMatrix, habitWindow, type HabitHistoryView, type HabitPeriod } from "./habit-matrix";
import { CheckInPanel } from "./check-in-panel";
import { DEFAULT_HABIT_ICON, HabitIcon, habitIconOptions } from "./habit-icon";
import {
  addHabitField,
  createHabit,
  fetchHabitEntries,
  fetchHabits,
  purgeHabit,
  removeHabitField,
  setHabitEntries,
  updateHabit,
  updateHabitField,
} from "./habits-api";
import type { Habit, HabitEntry, HabitFieldInput, HabitFieldPatch, HabitValueInput } from "./habits-api";
import { addDays, todayKey, type DayKey } from "./date";
import { completionRate, currentStreak, dayLevel, longestStreak } from "./level";

function inPositionOrder(habits: Habit[]): Habit[] {
  return [...habits].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

/** Replaces every entry of one habit's day, which is exactly what the day write answers with. */
function withDay(entries: HabitEntry[], habitId: string, day: DayKey, next: HabitEntry[]): HabitEntry[] {
  return [...entries.filter((entry) => !(entry.habitId === habitId && entry.date === day)), ...next];
}

export function HabitsPage() {
  const { locale, t } = useT();
  const [readingHabitLinked] = usePreference("modules.readingHabitLinked");
  const showBooksHabits = readingHabitLinked !== false;
  // One snapshot of the user's local today for the whole page: every window, streak and write derives from it.
  const [today] = useState<DayKey>(() => todayKey());
  const [period, setPeriod] = useState<HabitPeriod>("month");
  const [heatmapStyle, setHeatmapStyle] = useState<HabitHistoryView>("mono");
  const [anchor, setAnchor] = useState<DayKey>(() => todayKey());
  // The day the detail panel records on. The week grid above it is always visible.
  const [selectedDay, setSelectedDay] = useState<DayKey>(() => todayKey());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [archived, setArchived] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingPurgeId, setConfirmingPurgeId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newIcon, setNewIcon] = useState(DEFAULT_HABIT_ICON);
  const [newHabitOpen, setNewHabitOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const window = useMemo(() => habitWindow(anchor, period), [anchor, period]);
  const range = useMemo(() => {
    const yearStart = addDays(today, -364);
    const from = window.from < yearStart ? window.from : yearStart;
    const selectedFrom = selectedDay < from ? selectedDay : from;
    return { from: selectedFrom < today ? selectedFrom : today, to: today };
  }, [today, window, selectedDay]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Fetch every section; the preference only controls which habits are shown here.
    Promise.all([fetchHabits(), fetchHabitEntries({ from: range.from, to: range.to })])
      .then(([nextHabits, nextEntries]) => {
        if (cancelled) return;
        setHabits(inPositionOrder(nextHabits.filter((habit) => showBooksHabits || habit.section !== "books")));
        setEntries(nextEntries);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : t("habits.couldNotSave"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reload, showBooksHabits]);

  const replaceHabit = useCallback((next: Habit) => {
    setHabits((current) => inPositionOrder(current.map((habit) => (habit.id === next.id ? next : habit))));
    setArchived((current) => current.map((habit) => (habit.id === next.id ? next : habit)));
  }, []);

  const reportFailure = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("habits.couldNotSave"));
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const name = draft.trim();
    if (name === "") return;

    setBusy(true);
    await reportFailure(async () => {
      const created = await createHabit({ name, icon: newIcon, section: "habits" });
      setHabits((current) => inPositionOrder([...current, created]));
      setDraft("");
      setNewIcon(DEFAULT_HABIT_ICON);
      setNewHabitOpen(false);
    });
    setBusy(false);
  };

  const handleSetValues = async (habitId: string, date: DayKey, values: HabitValueInput[]) => {
    const next = await setHabitEntries(habitId, date, values);
    setEntries((current) => withDay(current, habitId, date, next));
  };

  const handleRename = async (habitId: string, name: string) => replaceHabit(await updateHabit(habitId, { name }));
  const handleUpdateIcon = async (habitId: string, icon: string) => replaceHabit(await updateHabit(habitId, { icon }));
  const handleAddField = async (habitId: string, input: HabitFieldInput) =>
    replaceHabit(await addHabitField(habitId, input));
  const handleUpdateField = async (habitId: string, fieldId: string, patch: HabitFieldPatch) =>
    replaceHabit(await updateHabitField(habitId, fieldId, patch));
  const handleRemoveField = async (habitId: string, fieldId: string) => {
    const result = await removeHabitField(habitId, fieldId);
    replaceHabit(result.habit);
    return result.field;
  };

  const handleArchive = async (habitId: string) => {
    const next = await updateHabit(habitId, { archived: true });
    setHabits((current) => current.filter((habit) => habit.id !== next.id));
    setArchived((current) => inPositionOrder([...current, next]));
    setEditingId(null);
  };

  const handleRestore = async (habitId: string) => {
    await reportFailure(async () => {
      const next = await updateHabit(habitId, { archived: false });
      setArchived((current) => current.filter((habit) => habit.id !== next.id));
      setHabits((current) => inPositionOrder([...current, next]));
    });
  };

  const handlePurge = async (habitId: string) => {
    if (confirmingPurgeId !== habitId) {
      setConfirmingPurgeId(habitId);
      return;
    }
    setConfirmingPurgeId(null);
    await reportFailure(async () => {
      await purgeHabit(habitId);
      setArchived((current) => current.filter((habit) => habit.id !== habitId));
      setEntries((current) => current.filter((entry) => entry.habitId !== habitId));
    });
  };

  const toggleArchived = async (open: boolean) => {
    setShowArchived(open);
    if (!open || archivedLoaded) return;
    await reportFailure(async () => {
      setArchived(inPositionOrder(await fetchHabits({ archived: true })));
      setArchivedLoaded(true);
    });
  };

  const windowEntries = useMemo(
    () => entries.filter((entry) => entry.date >= window.from && entry.date <= window.to),
    [entries, window],
  );
  const visibleArchived = archived.filter((habit) => showBooksHabits || habit.section !== "books");
  const editing = habits.find((habit) => habit.id === editingId) ?? null;

  const todayDone = useMemo(() => {
    const done = habits.filter((habit) => dayLevel(habit, today, entries) > 0).length;
    return { done, total: habits.length };
  }, [entries, habits, today]);
  const bestStreak = useMemo(() => Math.max(0, ...habits.map((habit) => longestStreak(habit, range.from, today, entries))), [entries, habits, range.from, today]);
  const thirtyDayRate = useMemo(() => {
    if (habits.length === 0) return 0;
    const from = addDays(today, -29);
    return Math.round(habits.reduce((sum, habit) => sum + completionRate(habit, from, today, entries), 0) / habits.length * 100);
  }, [entries, habits, today]);
  const retryLoad = () => setReload((current) => current + 1);
  const todayDate = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)), 12);
  const todayLabel = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }).format(todayDate);
  const todayProgress = todayDone.total === 0 ? 0 : Math.round((todayDone.done / todayDone.total) * 100);
  const rateStart = addDays(today, -29);

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 sm:gap-7 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            aria-label={t("habits.home")}
            title={t("habits.homeTitle")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <House className="size-4" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("habits.title")}</h1>
            <p className="text-[13px] text-muted-foreground">{t("habits.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="[&>button]:size-9">
            <ThemeToggle />
          </div>
          <div className="[&>button]:size-9"><LanguageToggle />
          </div>
          <Button type="button" variant="outline" onClick={() => { setError(null); setNewHabitOpen(true); }} className="h-9 gap-1.5 px-3 text-sm">
            <Plus aria-hidden="true" />
            {t("habits.new")}
          </Button>
        </div>
      </header>

      {error === null || newHabitOpen ? null : (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button type="button" variant="ghost" onClick={retryLoad} className="min-h-11 text-destructive hover:text-destructive">
            {t("habits.retry")}
          </Button>
        </div>
      )}

      {loading ? <LoadingSkeleton label={t("habits.loading")} className="min-h-32" /> : null}

      {!loading && error === null ? (
        <section aria-label={t("habits.summary")} className="grid gap-5 border-y border-border py-4 sm:grid-cols-3 sm:divide-x sm:divide-border sm:gap-0">
          <div className="min-w-0 space-y-1.5 sm:pr-6">
            <p className="text-xs text-muted-foreground">{t("habits.today")}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums text-foreground">{todayDone.done}/{todayDone.total}</span>
              <span className="text-sm text-muted-foreground">{t("habits.complete")}</span>
            </div>
            <div
              role="progressbar"
              aria-label={t("habits.progress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={todayProgress}
              className="h-0.5 w-40 max-w-full overflow-hidden rounded-full bg-muted"
            >
              <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${todayProgress}%` }} />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5 sm:px-6">
            <p className="text-xs text-muted-foreground">{t("habits.bestStreak")}</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">{bestStreak} <span className="text-sm font-normal text-muted-foreground">{t("habits.days")}</span></p>
          </div>
          <div className="min-w-0 space-y-1.5 sm:pl-6">
            <p className="text-xs text-muted-foreground">{t("habits.rate30")}</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">{thirtyDayRate}%</p>
          </div>
        </section>
      ) : null}

      {!loading && error === null && habits.length === 0 ? (
        <section className="flex flex-col items-start gap-3 py-10">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{t("habits.emptyTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("habits.emptyText")}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setNewHabitOpen(true)} className="h-9 gap-1.5 px-3 text-sm">
            <Plus aria-hidden="true" />
            {t("habits.createFirst")}
          </Button>
        </section>
      ) : null}

      {!loading && habits.length > 0 ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-7">
          <section className="order-last min-w-0 lg:order-none">
            <HabitMatrix
              habits={habits}
              entries={windowEntries}
              period={period}
              anchor={anchor}
              today={today}
              onPeriodChange={setPeriod}
              onAnchorChange={setAnchor}
              view={heatmapStyle}
              onViewChange={setHeatmapStyle}
            />
          </section>
          <section className="order-first min-w-0 border-t border-border pt-5 lg:sticky lg:top-6 lg:order-none lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[13px] font-medium text-muted-foreground">{t("habits.today")}</h2>
              <p className="text-xs text-muted-foreground">{todayLabel}</p>
            </div>
            <CheckInPanel
              habits={habits}
              entries={entries}
              today={today}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onSetValues={handleSetValues}
              onEditHabit={setEditingId}
            />
          </section>
        </div>
      ) : null}

      {!loading && error === null && habits.length > 0 ? (
        <section aria-labelledby="all-habits-heading" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="all-habits-heading" className="text-lg font-semibold text-foreground">{t("habits.all")}</h2>
              <p className="text-sm text-muted-foreground">{t("habits.rhythm")}</p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{habits.length} {t("habits.active")}</span>
          </div>
          <ul aria-label={t("habits.roster")} className="divide-y divide-border border-t border-border">
            {habits.map((habit) => {
              const rate = Math.round(completionRate(habit, rateStart, today, entries) * 100);
              const fieldCount = habit.fields.filter((field) => field.archivedAt === null).length;
              return (
                <li key={habit.id} className="grid min-h-11 min-w-0 gap-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <HabitIcon name={habit.icon} className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{habit.name}</p>
                      <p className="text-xs text-muted-foreground">{fieldCount} {t(fieldCount === 1 ? "habits.field" : "habits.fields")}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Flame className="size-3" aria-hidden="true" />
                      {t("habits.streak", { count: currentStreak(habit, today, entries) })}
                    </span>
                    <div className="flex items-center gap-2" aria-label={`${habit.name} ${t("habits.rate30")} ${rate}%`}>
                      <span className="h-1 w-12 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span className="block h-full rounded-full bg-foreground" style={{ width: `${rate}%` }} />
                      </span>
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{rate}%</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("habits.settingsFor", { name: habit.name })}
                      onClick={() => setEditingId(habit.id)}
                      className="size-11 shrink-0"
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!loading ? (
        <section aria-label={t("habits.archived")} className="border-t border-border">
          <Button
            type="button"
            variant="ghost"
            aria-expanded={showArchived}
            onClick={() => void toggleArchived(!showArchived)}
            className="flex h-9 w-full justify-between rounded-none px-0 text-left"
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <Archive className="size-4" aria-hidden="true" />
              {t("habits.archived")}
              <span className="text-xs tabular-nums text-muted-foreground">{visibleArchived.length}</span>
            </span>
            <ChevronDown className={cn("size-4", showArchived && "rotate-180")} aria-hidden="true" />
          </Button>
          {showArchived ? (
            <div className="pb-2">
              {visibleArchived.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("habits.nothingArchived")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {visibleArchived.map((habit) => {
                    const confirming = confirmingPurgeId === habit.id;
                    return (
                      <li key={habit.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <HabitIcon name={habit.icon} className="size-4" />
                          </span>
                          <span className="truncate text-sm font-medium text-foreground">{habit.name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="ghost" aria-label={t("habits.restore", { name: habit.name })} onClick={() => void handleRestore(habit.id)} className="min-h-11 gap-2">
                            <RotateCcw aria-hidden="true" />
                            {t("habits.restoreButton")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={confirming ? t("habits.confirmPurge", { name: habit.name }) : t("habits.deletePermanently")}
                            onClick={() => void handlePurge(habit.id)}
                            className="min-h-11 gap-2 text-destructive hover:text-destructive"
                          >
                            <Trash2 aria-hidden="true" />
                            {confirming ? t("habits.confirmDeletion") : t("habits.deletePermanently")}
                          </Button>
                          {confirming ? <span role="status" className="basis-full text-xs text-muted-foreground">{t("habits.deleteHint", { name: habit.name })}</span> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <Dialog open={newHabitOpen} onOpenChange={setNewHabitOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>{t("habits.newDialog")}</DialogTitle>
              <DialogCloseIcon aria-label={t("habits.closeNew")} className="size-11" />
            </DialogHeader>
            <form id="new-habit-form" onSubmit={(event) => void handleCreate(event)}>
              <DialogBody className="space-y-4">
                {newHabitOpen && error !== null ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                <label className="grid gap-1.5 text-sm font-medium">
                  {t("habits.name")}
                  <Input autoFocus aria-label={t("habits.name")} value={draft} onChange={(event) => setDraft(event.target.value)} className="h-11" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  {t("habits.icon")}
                  <Select value={newIcon} onValueChange={(value) => value && setNewIcon(value)}>
                    <SelectTrigger aria-label={t("habits.icon")} className="h-11 w-full">
                      <HabitIcon name={newIcon} className="size-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {habitIconOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="min-h-11">
                          <HabitIcon name={option.value} className="size-4" />
                          {t(option.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </DialogBody>
              <DialogFooter>
                <Button type="submit" form="new-habit-form" disabled={busy || draft.trim() === ""} className="min-h-11 gap-2">
                  <Plus aria-hidden="true" />
                  {t("habits.create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </DialogPortal>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("habits.settings")}{editing ? ` · ${editing.name}` : ""}</DialogTitle>
              <DialogCloseIcon aria-label={t("habits.closeSettings")} className="size-11" />
            </DialogHeader>
            <DialogBody className="max-h-[70vh] overflow-y-auto">
              {editing === null ? null : (
                <HabitEditor
                  habit={editing}
                  managedByBooks={editing.section === "books"}
                  onRename={(name) => handleRename(editing.id, name)}
                  onUpdateIcon={(icon) => handleUpdateIcon(editing.id, icon)}
                  onAddField={(input) => handleAddField(editing.id, input)}
                  onUpdateField={(fieldId, patch) => handleUpdateField(editing.id, fieldId, patch)}
                  onRemoveField={(fieldId) => handleRemoveField(editing.id, fieldId)}
                  onArchive={() => handleArchive(editing.id)}
                  onClose={() => setEditingId(null)}
                />
              )}
            </DialogBody>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </main>
  );
}
