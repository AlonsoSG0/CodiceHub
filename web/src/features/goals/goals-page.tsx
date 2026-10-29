import { useCallback, useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Archive, ArrowUpRight, CalendarRange, Check, ChevronRight, House, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogBody,
  DialogClose,
  DialogCloseIcon,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MenuPopup, menuItemClassName } from "@/components/ui/menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  createGoal,
  createGoalGroup,
  deleteGoalGroup,
  fetchGoals,
  fetchGoalVocabulary,
  updateGoalGroup,
  type GoalGroup,
  type GoalStatus,
  type GoalSummary,
  type Tag,
  type Category,
} from "./goals-api";

function inPositionOrder(groups: GoalGroup[]): GoalGroup[] {
  return [...groups].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

function goalsInPositionOrder(goals: GoalSummary[]): GoalSummary[] {
  return [...goals].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : "unknown_error";
}

const statusStyles: Record<GoalStatus, { dot: string; text: string }> = {
  todo: { dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  doing: { dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  done: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
};

function statusLabel(status: GoalStatus, t: (key: string) => string): string {
  return t(status === "todo" ? "goals.statusTodo" : status === "doing" ? "goals.statusDoing" : "goals.statusDone");
}

function isDone(goal: GoalSummary): boolean {
  return goal.status === "done";
}

type GoalsView = {
  status: "all" | "open" | "done";
  tag: string;
  category: string;
  dueSoon: boolean;
  sort: "position" | "due";
};

const defaultView: GoalsView = { status: "all", tag: "all", category: "all", dueSoon: false, sort: "position" };
const viewKey = "chub.goals.view";

function readView(): GoalsView {
  try {
    const raw = window.localStorage.getItem(viewKey);
    if (raw === null) return defaultView;
    const parsed = JSON.parse(raw) as Partial<GoalsView>;
    return {
      status: parsed.status === "open" || parsed.status === "done" ? parsed.status : "all",
      tag: typeof parsed.tag === "string" ? parsed.tag : "all",
      category: typeof parsed.category === "string" ? parsed.category : "all",
      dueSoon: parsed.dueSoon === true,
      sort: parsed.sort === "due" ? "due" : "position",
    };
  } catch {
    return defaultView;
  }
}

function writeView(view: GoalsView): void {
  try {
    window.localStorage.setItem(viewKey, JSON.stringify(view));
  } catch {
    // A private window without storage still gets a working page for this session.
  }
}

function dueSoonLimit(today: string): string {
  const date = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)), 12);
  date.setDate(date.getDate() + 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Soonest first, undated last; the overdue ones therefore lead. */
function sortGoals(goals: GoalSummary[], sort: GoalsView["sort"]): GoalSummary[] {
  if (sort === "position") return goalsInPositionOrder(goals);
  return [...goals].sort((left, right) => {
    if (left.dueDate === null && right.dueDate === null) return left.position - right.position;
    if (left.dueDate === null) return 1;
    if (right.dueDate === null) return -1;
    return left.dueDate.localeCompare(right.dueDate) || left.position - right.position;
  });
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function localNoon(key: string): Date {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12);
}

/** "Oct 1 – Dec 31", adding the year only when it is not this one. */
function periodLabel(group: GoalGroup, locale: string): string | null {
  if (group.periodStart === null && group.periodEnd === null) return null;
  const thisYear = String(new Date().getFullYear());
  const format = (key: string) => new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: key.slice(0, 4) === thisYear ? undefined : "numeric",
  }).format(localNoon(key));
  return `${group.periodStart === null ? "…" : format(group.periodStart)} – ${group.periodEnd === null ? "…" : format(group.periodEnd)}`;
}

export function GoalsPage() {
  const { locale, t } = useT();
  const [groups, setGroups] = useState<GoalGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupDraft, setNewGroupDraft] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GoalGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [composers, setComposers] = useState<Record<string, string>>({});
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const [archivedGroups, setArchivedGroups] = useState<GoalGroup[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [periodTarget, setPeriodTarget] = useState<GoalGroup | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [view, setView] = useState<GoalsView>(() => readView());
  const [search, setSearch] = useState("");
  const [vocabulary, setVocabulary] = useState<{ tags: Tag[]; categories: Category[] }>({ tags: [], categories: [] });
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [active, archived, words] = await Promise.all([fetchGoals(), fetchGoals(true), fetchGoalVocabulary()]);
      setGroups(inPositionOrder(active));
      setArchivedGroups(inPositionOrder(archived));
      setVocabulary(words);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateGroup = async (event: FormEvent) => {
    event.preventDefault();
    const name = newGroupDraft.trim();
    if (name === "") return;

    setError(null);
    try {
      const created = await createGoalGroup({ name });
      setGroups((current) => inPositionOrder([...current, created]));
      setNewGroupDraft("");
      setNewGroupOpen(false);
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const handleRename = async (event: FormEvent, group: GoalGroup) => {
    event.preventDefault();
    const name = renameDraft.trim();
    if (name === "") {
      setError(t("goals.groupNameRequired"));
      return;
    }
    if (name === group.name) {
      setRenaming(null);
      return;
    }

    setError(null);
    try {
      const updated = await updateGoalGroup(group.id, { name });
      setGroups((current) =>
        inPositionOrder(current.map((entry) => (entry.id === updated.id ? { ...entry, ...updated, goals: entry.goals } : entry))),
      );
      setRenaming(null);
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const moveGroup = (from: GoalGroup[], to: GoalGroup[], updated: GoalGroup): { from: GoalGroup[]; to: GoalGroup[] } => ({
    from: from.filter((entry) => entry.id !== updated.id),
    to: inPositionOrder([...to, updated]),
  });

  const handleArchive = async (group: GoalGroup, archived: boolean) => {
    setError(null);
    try {
      const updated = await updateGoalGroup(group.id, { archived });
      if (archived) {
        const next = moveGroup(groups, archivedGroups, updated);
        setGroups(next.from);
        setArchivedGroups(next.to);
      } else {
        const next = moveGroup(archivedGroups, groups, updated);
        setArchivedGroups(next.from);
        setGroups(next.to);
      }
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const reorderGroup = async (group: GoalGroup, direction: -1 | 1) => {
    const index = groups.findIndex((entry) => entry.id === group.id);
    const neighbour = groups[index + direction];
    if (neighbour === undefined) return;

    setError(null);
    try {
      await Promise.all([
        updateGoalGroup(group.id, { position: neighbour.position }),
        updateGoalGroup(neighbour.id, { position: group.position }),
      ]);
      setGroups((current) => {
        const next = [...current];
        next[index] = { ...neighbour, position: group.position };
        next[index + direction] = { ...group, position: neighbour.position };
        return next;
      });
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const openPeriod = (group: GoalGroup) => {
    setPeriodTarget(group);
    setPeriodStart(group.periodStart ?? "");
    setPeriodEnd(group.periodEnd ?? "");
  };

  const savePeriod = async (clear = false) => {
    if (periodTarget === null) return;
    setError(null);
    try {
      const updated = clear
        ? await updateGoalGroup(periodTarget.id, { periodStart: null, periodEnd: null })
        : await updateGoalGroup(periodTarget.id, {
            periodStart: periodStart === "" ? null : periodStart,
            periodEnd: periodEnd === "" ? null : periodEnd,
          });
      setGroups((current) => current.map((entry) => (entry.id === updated.id ? { ...entry, ...updated, goals: entry.goals } : entry)));
      setArchivedGroups((current) => current.map((entry) => (entry.id === updated.id ? { ...entry, ...updated, goals: entry.goals } : entry)));
      setPeriodTarget(null);
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const handleDeleteGroup = async () => {
    if (deleteTarget === null) return;
    setDeletingGroup(true);
    setError(null);
    try {
      await deleteGoalGroup(deleteTarget.id);
      setGroups((current) => current.filter((entry) => entry.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setDeletingGroup(false);
    }
  };

  const handleAddGoal = async (groupId: string, event: FormEvent) => {
    event.preventDefault();
    const title = (composers[groupId] ?? "").trim();
    if (title === "") return;

    setError(null);
    try {
      const created = await createGoal(groupId, { title });
      setGroups((current) =>
        current.map((group) =>
          group.id === groupId ? { ...group, goals: goalsInPositionOrder([...group.goals, created]) } : group,
        ),
      );
      setComposers((current) => ({ ...current, [groupId]: "" }));
      navigate(`/goals/${created.id}`);
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const today = todayKey();
  const soonLimit = dueSoonLimit(today);
  const filtering = view.status !== "all" || view.tag !== "all" || view.category !== "all" || view.dueSoon || search.trim() !== "";

  const matches = (goal: GoalSummary): boolean => {
    if (view.status === "open" && isDone(goal)) return false;
    if (view.status === "done" && !isDone(goal)) return false;
    if (view.tag !== "all" && !goal.tags.some((tag) => tag.name === view.tag)) return false;
    if (view.category !== "all" && goal.category?.name !== view.category) return false;
    if (view.dueSoon) {
      if (goal.dueDate === null || isDone(goal)) return false;
      if (goal.dueDate > soonLimit) return false;
    }
    const query = search.trim().toLowerCase();
    if (query !== "" && !goal.title.toLowerCase().includes(query)) return false;
    return true;
  };

  const visibleGroups = groups
    .map((group) => ({ ...group, goals: sortGoals(group.goals.filter(matches), view.sort) }))
    .filter((group) => !filtering || group.goals.length > 0);

  const updateView = (patch: Partial<GoalsView>) => {
    const next = { ...view, ...patch };
    setView(next);
    writeView(next);
  };

  const clearFilters = () => {
    const next = { ...defaultView, sort: view.sort };
    setView(next);
    writeView(next);
    setSearch("");
  };

  const goalCount = groups.reduce((total, group) => total + group.goals.length, 0);
  const summary = `${groups.length} ${groups.length === 1 ? t("goals.countGroup") : t("goals.countGroups")} · ${goalCount} ${goalCount === 1 ? t("goals.countGoal") : t("goals.countGoals")}`;

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col px-4 pt-5 pb-16 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-border/70 pb-5">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            to="/"
            aria-label={t("goals.homeLabel")}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"
          >
            <House size={16} aria-hidden="true" />
            {t("goals.home")}
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-foreground">{t("goals.title")}</h1>
              {groups.length > 0 ? <p className="text-[13px] tabular-nums text-muted-foreground">{summary}</p> : null}
            </div>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{t("goals.noGoals")}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!newGroupOpen ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewGroupOpen(true)}
              className="min-h-11 gap-2 px-3 text-[13px] sm:min-h-9"
            >
              <Plus size={16} aria-hidden="true" />
              {t("goals.newGroup")}
            </Button>
          ) : null}
          <div className="[&_button]:!size-11">
            <ThemeToggle />
          </div>
          <LanguageToggle />
        </div>
      </header>

      {!loading && groups.length > 0 ? (
        <section aria-label={t("goals.filtering")} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 py-3">
          <div role="group" aria-label={t("goals.statusFilter")} className="inline-flex items-center gap-0.5">
            {([["all", t("goals.all")], ["open", t("goals.open")], ["done", t("goals.statusDone")]] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                aria-pressed={view.status === value}
                onClick={() => updateView({ status: value })}
                className={cn(
                  "h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none",
                  view.status === value && "bg-muted text-foreground",
                )}
              >
                {label}
              </Button>
            ))}
          </div>

          <Button
            type="button"
            variant="ghost"
            aria-pressed={view.dueSoon}
            onClick={() => updateView({ dueSoon: !view.dueSoon })}
            className={cn(
              "h-8 gap-1 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none",
              view.dueSoon && "bg-muted text-foreground",
            )}
          >
            <CalendarRange size={12} aria-hidden="true" />
            {t("goals.dueSoon")}
          </Button>

          <Select value={view.tag} onValueChange={(value) => value && updateView({ tag: value })}>
            <SelectTrigger aria-label={t("goals.tagFilter")} className="h-8 gap-1 border-border/70 px-2 text-xs text-muted-foreground">
              <SelectValue>{(value: string) => (value === "all" ? t("goals.anyTag") : `#${value}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="min-h-9 text-sm">{t("goals.anyTag")}</SelectItem>
              {vocabulary.tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.name} className="min-h-9 text-sm">#{tag.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={view.category} onValueChange={(value) => value && updateView({ category: value })}>
            <SelectTrigger aria-label={t("goals.categoryFilter")} className="h-8 gap-1 border-border/70 px-2 text-xs text-muted-foreground">
              <SelectValue>{(value: string) => (value === "all" ? t("goals.anyCategory") : value)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="min-h-9 text-sm">{t("goals.anyCategory")}</SelectItem>
              {vocabulary.categories.map((category) => (
                <SelectItem key={category.id} value={category.name} className="min-h-9 text-sm">{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={view.sort} onValueChange={(value) => value && updateView({ sort: value as GoalsView["sort"] })}>
            <SelectTrigger aria-label={t("goals.sort")} className="h-8 gap-1 border-border/70 px-2 text-xs text-muted-foreground">
              <SelectValue>{(value: string) => (value === "due" ? t("goals.sortDue") : t("goals.sortPosition"))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="position" className="min-h-9 text-sm">{t("goals.sortPosition")}</SelectItem>
              <SelectItem value="due" className="min-h-9 text-sm">{t("goals.sortDue")}</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="search"
            aria-label={t("goals.searchGoals")}
            placeholder={t("goals.searchGoalsPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-[11rem] border-border/70 text-xs"
          />

          {filtering ? (
            <Button type="button" variant="ghost" onClick={clearFilters} className="h-8 px-2 text-xs text-muted-foreground">
              {t("goals.clear")}
            </Button>
          ) : null}

          {filtering ? (
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {t("goals.shown", { shown: visibleGroups.reduce((total, group) => total + group.goals.length, 0), total: goalCount })}
            </span>
          ) : null}
        </section>
      ) : null}

      {newGroupOpen ? (
        <form
          aria-label={t("goals.createGoalGroup")}
          className="grid gap-3 border-b border-border/70 py-5 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-end"
          onSubmit={(event) => void handleCreateGroup(event)}
        >
          <div className="min-w-0">
            <label htmlFor="new-goal-group-name" className="mb-1.5 block text-[13px] font-medium text-foreground">{t("goals.groupNameLabel")}</label>
            <Input
              id="new-goal-group-name"
              aria-label={t("goals.groupName")}
              placeholder={t("goals.groupNamePlaceholder")}
              value={newGroupDraft}
              onChange={(event) => setNewGroupDraft(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Escape") {
                  setNewGroupOpen(false);
                  setNewGroupDraft("");
                }
              }}
              autoFocus
              className="min-h-11"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={newGroupDraft.trim() === ""} className="min-h-11 px-4">
              {t("goals.createGroup")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setNewGroupOpen(false);
                setNewGroupDraft("");
              }}
              className="min-h-11 px-4"
            >
              {t("goals.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {error === null ? null : (
        <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-destructive/30 py-3">
          <p className="text-[13px] leading-5 text-destructive">{error}</p>
          <Button type="button" variant="ghost" className="min-h-11 px-3" onClick={() => void load()}>
            {t("goals.retry")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="pt-6">
          <LoadingSkeleton label={t("goals.loading")} />
        </div>
      ) : (
        <section aria-label={t("goals.title")} className="pt-2">
          {groups.length === 0 && error === null ? (
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border/70 py-6">
              <p className="max-w-[52ch] text-[14px] leading-6 text-muted-foreground">
                {t("goals.emptyGroups")}
              </p>
            </div>
          ) : null}

          {visibleGroups.map((group, index) => {
            const groupTitleId = `goal-group-${group.id}`;
            const groupInputId = `goal-composer-${group.id}`;
            const groupName = renaming?.id === group.id;

            return (
              <section
                key={group.id}
                aria-labelledby={groupTitleId}
                className="grid min-w-0 gap-x-8 gap-y-4 border-b border-border/70 py-6 md:grid-cols-[minmax(13rem,0.62fr)_minmax(0,1.38fr)] md:gap-x-12"
              >
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5 text-[12px] tabular-nums text-muted-foreground" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-5 text-muted-foreground">{t("goals.group")}</p>
                      {groupName ? (
                        <form className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1" onSubmit={(event) => void handleRename(event, group)}>
                          <label className="sr-only" htmlFor={`goal-group-name-${group.id}`}>{t("goals.groupName")}</label>
                          <Input
                            id={`goal-group-name-${group.id}`}
                            aria-label={t("goals.groupName")}
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                              if (event.key === "Escape") setRenaming(null);
                            }}
                            autoFocus
                            className="min-h-11 min-w-0"
                          />
                          <Button type="submit" variant="ghost" aria-label={t("goals.saveGroupName")} className="size-11" title={t("goals.saveGroupName")}>
                            <Check size={17} aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={t("goals.cancelRename")}
                            title={t("goals.cancelRename")}
                            className="size-11"
                            onClick={() => setRenaming(null)}
                          >
                            <X size={17} aria-hidden="true" />
                          </Button>
                        </form>
                      ) : (
                        <h2 id={groupTitleId} className="mt-0.5 break-words text-[18px] leading-6 font-medium tracking-tight text-foreground">
                          {group.name}
                        </h2>
                      )}
                      <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">
                        {group.goals.length} {group.goals.length === 1 ? t("goals.countGoal") : t("goals.countGoals")}
                        {group.goals.length === 0 ? null : (
                          <> · {t("goals.progressDone", { done: group.goals.filter(isDone).length, total: group.goals.length })}</>
                        )}
                      </p>
                      {periodLabel(group, locale) === null ? null : (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <CalendarRange size={11} aria-hidden="true" />
                          {periodLabel(group, locale)}
                        </p>
                      )}
                    </div>
                    <BaseMenu.Root>
                      <BaseMenu.Trigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={t("goals.actions", { name: group.name })}
                            title={t("goals.actions", { name: group.name })}
                            className="size-11 shrink-0 text-muted-foreground"
                          />
                        }
                      >
                        <MoreHorizontal size={18} aria-hidden="true" />
                      </BaseMenu.Trigger>
                      <MenuPopup align="end">
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-11")}
                          onClick={() => {
                            setRenaming({ id: group.id, name: group.name });
                            setRenameDraft(group.name);
                          }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                          {t("goals.rename")}
                        </BaseMenu.Item>
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-11")}
                          disabled={groups.findIndex((entry) => entry.id === group.id) === 0}
                          onClick={() => void reorderGroup(group, -1)}
                        >
                          <ChevronRight size={14} className="-rotate-90" aria-hidden="true" />
                          {t("goals.moveUp")}
                        </BaseMenu.Item>
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-11")}
                          disabled={groups.findIndex((entry) => entry.id === group.id) === groups.length - 1}
                          onClick={() => void reorderGroup(group, 1)}
                        >
                          <ChevronRight size={14} className="rotate-90" aria-hidden="true" />
                          {t("goals.moveDown")}
                        </BaseMenu.Item>
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-11")}
                          onClick={() => openPeriod(group)}
                        >
                          <CalendarRange size={14} aria-hidden="true" />
                          {t("goals.setPeriod")}
                        </BaseMenu.Item>
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-11")}
                          onClick={() => void handleArchive(group, true)}
                        >
                          <Archive size={14} aria-hidden="true" />
                          {t("goals.archiveGroup")}
                        </BaseMenu.Item>
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-11 text-destructive hover:text-destructive")}
                          onClick={() => setDeleteTarget(group)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          {t("goals.deleteGroup")}
                        </BaseMenu.Item>
                      </MenuPopup>
                    </BaseMenu.Root>
                  </div>
                </div>

                <div className="min-w-0">
                  {group.goals.length > 0 ? (
                    <ul className="divide-y divide-border/70 border-y border-border/70">
                      {goalsInPositionOrder(group.goals).map((goal) => (
                        <li key={goal.id}>
                          <Link
                            to={`/goals/${goal.id}`}
                            className="group flex min-h-14 min-w-0 items-center justify-between gap-4 py-2.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"
                          >
                            <span className="min-w-0 flex-1">
                              <span className={cn("block break-words text-[14px] leading-5 font-medium group-hover:underline group-hover:decoration-border group-hover:underline-offset-4", isDone(goal) && "text-muted-foreground line-through decoration-border")}>
                                {goal.title}
                              </span>
                              <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] leading-4 text-muted-foreground">
                                <span className={cn("inline-flex items-center gap-1", statusStyles[goal.status].text)}>
                                  <span className={cn("size-1.5 rounded-full", statusStyles[goal.status].dot)} aria-hidden="true" />
                                  {statusLabel(goal.status, t)}
                                </span>
                                {goal.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}
                                {goal.category ? <span>{goal.category.name}</span> : null}
                              </span>
                            </span>
                            {goal.dueDate === null ? null : (
                              <span
                                className={cn(
                                  "inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums",
                                  !isDone(goal) && goal.dueDate < new Date().toISOString().slice(0, 10)
                                    ? "text-destructive"
                                    : "text-muted-foreground",
                                )}
                              >
                                <CalendarRange size={11} aria-hidden="true" />
                                {new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(localNoon(goal.dueDate))}
                              </span>
                            )}
                            <ArrowUpRight
                              size={16}
                              aria-hidden="true"
                              className="shrink-0 text-muted-foreground transition-[color,opacity] duration-150 group-hover:text-foreground motion-reduce:transition-none"
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="border-y border-border/70 py-4 text-[13px] leading-5 text-muted-foreground">{t("goals.emptyGroup")}</p>
                  )}

                  {composerFor === group.id ? (
                    <form className="mt-3 grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-3" onSubmit={(event) => void handleAddGoal(group.id, event)}>
                      <div className="min-w-0">
                        <label htmlFor={groupInputId} className="mb-1 block text-[12px] text-muted-foreground">{t("goals.newGoalLabel")}</label>
                        <Input
                          id={groupInputId}
                          aria-label={t("goals.addGoalTo", { name: group.name })}
                          placeholder={t("goals.newGoalPlaceholder")}
                          autoFocus
                          value={composers[group.id] ?? ""}
                          onChange={(event) => setComposers((current) => ({ ...current, [group.id]: event.target.value }))}
                          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                            if (event.key === "Escape") {
                              setComposers((current) => ({ ...current, [group.id]: "" }));
                              setComposerFor(null);
                            }
                          }}
                          className="min-h-11"
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="ghost"
                        disabled={(composers[group.id] ?? "").trim() === ""}
                        className="min-h-11 justify-start px-3 text-[13px] sm:justify-center"
                      >
                        <Plus size={16} aria-hidden="true" />
                        {t("goals.addGoal")}
                      </Button>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setComposerFor(group.id)}
                      className="mt-3 h-9 gap-1.5 px-2 text-[13px] text-muted-foreground"
                    >
                      <Plus size={15} aria-hidden="true" />
                      {t("goals.newGoal")}
                    </Button>
                  )}
                </div>
              </section>
            );
          })}
        </section>
      )}

      {!loading && archivedGroups.length > 0 ? (
        <section aria-label={t("goals.archivedGroups")} className="mt-6 border-t border-border/70 pt-3">
          <Button
            type="button"
            variant="ghost"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((current) => !current)}
            className="h-9 gap-1.5 px-1 text-[13px] text-muted-foreground"
          >
            <ChevronRight
              size={13}
              aria-hidden="true"
              className={cn("transition-transform duration-150 motion-reduce:transition-none", showArchived && "rotate-90")}
            />
            {t("goals.archivedGroups")}
            <span className="tabular-nums">{archivedGroups.length}</span>
          </Button>
          {showArchived ? (
            <ul className="mt-1 divide-y divide-border/70 border-t border-border/70">
              {archivedGroups.map((group) => (
                <li key={group.id} className="flex min-h-12 flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-muted-foreground">{group.name}</p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">{group.goals.length} {group.goals.length === 1 ? t("goals.countGoal") : t("goals.countGoals")}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" onClick={() => void handleArchive(group, false)} className="h-8 px-2 text-xs">
                      {t("goals.restore")}
                    </Button>
                    <Button type="button" variant="ghost" aria-label={t("goals.deleteName", { name: group.name })} onClick={() => setDeleteTarget(group)} className="size-8 p-0 text-muted-foreground">
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <Dialog open={periodTarget !== null} onOpenChange={(open) => { if (!open) setPeriodTarget(null); }}>
        <DialogPortal>
          <DialogBackdrop className="motion-reduce:transition-none" />
          <DialogPopup className="transition-opacity duration-200 motion-reduce:transition-none">
            <DialogHeader>
              <div className="flex flex-col gap-1">
                <DialogTitle>{t("goals.periodTitle")}</DialogTitle>
                <DialogDescription>
                  {periodTarget === null ? "" : t("goals.groupPeriodDescription", { name: periodTarget.name })}
                </DialogDescription>
              </div>
              <DialogCloseIcon aria-label={t("goals.close")} className="size-11" />
            </DialogHeader>
            <DialogBody className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="goal-period-start" className="mb-1 block text-[12px] text-muted-foreground">{t("goals.periodStart")}</label>
                <Input
                  id="goal-period-start"
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  className="min-h-11"
                />
              </div>
              <div>
                <label htmlFor="goal-period-end" className="mb-1 block text-[12px] text-muted-foreground">{t("goals.periodEnd")}</label>
                <Input
                  id="goal-period-end"
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                  className="min-h-11"
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => void savePeriod(true)} className="mr-auto h-9 px-2 text-xs">
                {t("goals.clear")}
              </Button>
              <DialogClose render={<Button type="button" variant="ghost" className="h-9" />}>{t("goals.cancel")}</DialogClose>
              <Button type="button" onClick={() => void savePeriod()} className="h-9">
                {t("goals.savePeriod")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </DialogPortal>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogPortal>
          <DialogBackdrop className="motion-reduce:transition-none" />
          <DialogPopup className="transition-opacity duration-200 data-[ending-style]:scale-100 data-[starting-style]:scale-100 motion-reduce:transition-none">
            <DialogHeader>
              <div className="flex flex-col gap-1">
                <DialogTitle>{t("goals.deleteGroupConfirm")}</DialogTitle>
                <DialogDescription>
                  {deleteTarget === null ? "" : t("goals.deleteGroupDescription", { name: deleteTarget.name })}
                </DialogDescription>
              </div>
              <DialogCloseIcon aria-label={t("goals.close")} className="size-11" />
            </DialogHeader>
            <DialogBody>
              <p className="text-sm text-muted-foreground">{t("goals.deleteUndo")}</p>
            </DialogBody>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="ghost" className="min-h-11 px-4" />}>{t("goals.cancel")}</DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={deletingGroup}
                onClick={() => void handleDeleteGroup()}
                className="min-h-11 px-4"
              >
                {t("goals.deleteGroup")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </main>
  );
}
