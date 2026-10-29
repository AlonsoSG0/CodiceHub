import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  House,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  Target,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PriorityControl, priorityStyles } from "@/components/priority-control";
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
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/i18n";
import { MenuPopup, menuItemClassName } from "@/components/ui/menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  bulkChecklists,
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  fetchChecklists,
  pruneChecklists,
  updateChecklist,
  updateChecklistItem,
  type Checklist,
  type ChecklistBulkAction,
  type ChecklistItem,
  type ChecklistPriority,
  type ChecklistRecurrence,
  type UpdateChecklistItemInput,
} from "./tasks-api";
import { dayKeyOf, dayLabel, shiftDay, shortDayLabel, todayKey, type DayKey } from "./tasks-date";
import { fetchGoals } from "@/features/goals/goals-api";
import { usePreference } from "@/features/settings/preferences";
import {
  defaultRetention,
  readRetention,
  retentionChoices,
  writeRetention,
  type RetentionPolicy,
  type RetentionScope,
} from "./retention";

type Entry = { item: ChecklistItem; groupName: string };
type Tab = "today" | "groups";
type DebtOrder = "asc" | "desc";

const recurrenceKeys: Record<ChecklistRecurrence, string> = {
  none: "tasks.recurrenceNone",
  daily: "tasks.recurrenceDaily",
  weekly: "tasks.recurrenceWeekly",
};

const recurrenceOrder: ChecklistRecurrence[] = ["none", "daily", "weekly"];

function inPositionOrder(checklists: Checklist[]): Checklist[] {
  return [...checklists].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : "unknown_error";
}

/** `Comprar café #Errands` routes itself; only a trailing tag counts, so `#` inside text is safe. */
function parseCapture(raw: string): { text: string; groupName: string | null } {
  const match = /(?:^|\s)#([\p{L}\p{N}_-]+)\s*$/u.exec(raw);
  if (match === null) return { text: raw.trim(), groupName: null };
  return { text: raw.slice(0, match.index).trim(), groupName: match[1]! };
}

function replaceItem(checklists: Checklist[], updated: ChecklistItem): Checklist[] {
  return checklists.map((checklist) =>
    checklist.id !== updated.listId
      ? checklist
      : { ...checklist, items: checklist.items.map((item) => (item.id === updated.id ? updated : item)) },
  );
}

function DueControl({ dueDate, today, locale, t, onChange }: { dueDate: string | null; today: DayKey; locale: string; t: (key: string, values?: Record<string, string | number>) => string; onChange: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const overdue = dueDate !== null && dueDate < today;

  if (open) {
    return (
      <input
        type="date"
        aria-label={t("tasks.dueDate")}
        autoFocus
        defaultValue={dueDate ?? ""}
        onChange={(event) => {
          onChange(event.target.value === "" ? null : event.target.value);
          setOpen(false);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="h-6 rounded border border-input bg-transparent px-1 text-[10px] text-foreground"
      />
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={dueDate === null ? t("tasks.dueSet") : t("tasks.due", { date: dueDate })}
      onClick={() => setOpen(true)}
      className={cn(
        "h-6 shrink-0 gap-1 rounded px-1 text-[10px] transition-colors duration-150 motion-reduce:transition-none",
        overdue ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <CalendarDays size={10} aria-hidden="true" />
      {dueDate === null ? null : shortDayLabel(dueDate, today, locale)}
    </Button>
  );
}

function DueChip({ dueDate, today, locale, t }: { dueDate: string; today: DayKey; locale: string; t: (key: string, values?: Record<string, string | number>) => string }) {
  const overdue = dueDate < today;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[10px] tabular-nums",
        overdue ? "text-destructive" : "text-muted-foreground",
      )}
      title={overdue ? t("tasks.overdueSince", { date: dueDate }) : t("tasks.due", { date: dueDate })}
    >
      <CalendarDays size={10} aria-hidden="true" />
      {shortDayLabel(dueDate, today, locale)}
    </span>
  );
}

function TaskRow({
  entry,
  today,
  locale,
  t,
  pending,
  showGroup,
  showDueControl,
  goalName,
  onToggle,
  onDelete,
  onPriority,
  onDueDate,
  onRecurrence,
  showRecurrenceControl,
}: {
  entry: Entry;
  today: DayKey;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  pending: boolean;
  showGroup: boolean;
  showDueControl: boolean;
  showRecurrenceControl: boolean;
  goalName: string | null;
  onToggle: (item: ChecklistItem) => void;
  onDelete: (item: ChecklistItem) => void;
  onPriority: (item: ChecklistItem, priority: ChecklistPriority) => void;
  onDueDate: (item: ChecklistItem, dueDate: string | null) => void;
  onRecurrence: (item: ChecklistItem, recurrence: ChecklistRecurrence) => void;
}) {
  const { item, groupName } = entry;
  return (
    <li className="group/item flex min-h-10 flex-wrap items-center gap-x-1.5 gap-y-1 py-1">
      <Button
        type="button"
        variant="ghost"
        role="checkbox"
        aria-label={item.text}
        aria-checked={item.done}
        disabled={pending}
        onClick={() => onToggle(item)}
        className="size-9 shrink-0 rounded-md p-0 text-muted-foreground transition-colors duration-150 motion-reduce:transition-none"
      >
        <span
          className={cn(
            "flex size-[18px] items-center justify-center rounded-[5px] border transition-colors duration-150 motion-reduce:transition-none",
            item.done ? "border-foreground bg-foreground text-background" : "border-border",
          )}
          aria-hidden="true"
        >
          {item.done ? <Check size={12} /> : null}
        </span>
      </Button>

      <span
        className={cn(
          "min-w-[12rem] flex-1 break-words text-sm leading-6 transition-colors duration-150 motion-reduce:transition-none",
          item.done ? "text-muted-foreground line-through decoration-border" : "text-foreground",
        )}
      >
        {item.text}
      </span>

      {goalName === null ? null : (
        <span className="inline-flex max-w-[26%] shrink-0 items-center gap-1 truncate text-[10px] text-muted-foreground">
          <Target size={10} aria-hidden="true" />
          <span className="truncate">{goalName}</span>
        </span>
      )}
      {item.dueDate !== null && !showDueControl ? <DueChip dueDate={item.dueDate} today={today} locale={locale} t={t} /> : null}
      {showGroup ? (
        <span className="max-w-[28%] shrink-0 truncate text-[10px] text-muted-foreground">{groupName}</span>
      ) : null}

      <PriorityControl priority={item.priority} onChange={(priority) => onPriority(item, priority)} />

      {showDueControl ? (
        <DueControl dueDate={item.dueDate} today={today} locale={locale} t={t} onChange={(dueDate) => onDueDate(item, dueDate)} />
      ) : null}

      {item.recurrence === "none" || showRecurrenceControl ? null : (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded px-1 text-[10px] text-muted-foreground"
          title={t(recurrenceKeys[item.recurrence])}
        >
          <Repeat size={10} aria-hidden="true" />
          {item.recurrence === "daily" ? "D" : "W"}
        </span>
      )}

      {showRecurrenceControl ? (
        <BaseMenu.Root>
          <BaseMenu.Trigger
            render={
              <Button
                type="button"
                variant="ghost"
                aria-label={t("tasks.repeat", { label: t(recurrenceKeys[item.recurrence]) })}
                className={cn(
                  "size-6 shrink-0 rounded p-0",
                  item.recurrence === "none" ? "text-muted-foreground opacity-50 hover:opacity-100" : "text-foreground",
                )}
              />
            }
          >
            <Repeat size={12} aria-hidden="true" />
          </BaseMenu.Trigger>
          <MenuPopup align="end">
            {recurrenceOrder.map((value) => (
              <BaseMenu.Item
                key={value}
                className={cn(menuItemClassName, "min-h-9 gap-2")}
                onClick={() => onRecurrence(item, value)}
              >
                <Repeat size={13} aria-hidden="true" />
                {t(recurrenceKeys[value])}
                {item.recurrence === value ? <Check size={13} className="ml-auto" aria-hidden="true" /> : null}
              </BaseMenu.Item>
            ))}
          </MenuPopup>
        </BaseMenu.Root>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        aria-label={`Delete ${item.text}`}
        onClick={() => onDelete(item)}
        className="size-9 shrink-0 rounded-md p-0 text-muted-foreground transition-[opacity,color] duration-150 motion-reduce:transition-none sm:opacity-0 sm:group-hover/item:opacity-100 sm:group-focus-within/item:opacity-100"
      >
        <X size={14} aria-hidden="true" />
      </Button>
    </li>
  );
}

function DayBlock({
  day,
  label,
  entries,
  open,
  onToggle,
  children,
}: {
  day: DayKey;
  label: string;
  entries: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} data-day={day} className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 border-b border-border pb-1.5 text-left"
      >
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
        <h2 className="min-w-0 truncate text-[15px] leading-6 font-medium text-foreground">{label}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{entries} open</span>
      </button>
      {open ? <div className="mt-0.5">{children}</div> : null}
    </section>
  );
}

export function TasksPage() {
  const { locale, t } = useT();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [showPast, setShowPast] = useState(false);
  const [debtOrder, setDebtOrder] = useState<DebtOrder>("asc");
  const [collapsedDays, setCollapsedDays] = useState<Set<DayKey>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupDraft, setNewGroupDraft] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Checklist | null>(null);
  const [deletingList, setDeletingList] = useState(false);
  const [pendingItems, setPendingItems] = useState<Set<string>>(() => new Set());
  const [composers, setComposers] = useState<Record<string, string>>({});
  const [openComposers, setOpenComposers] = useState<Set<string>>(() => new Set());
  const [capture, setCapture] = useState("");
  const [captureTarget, setCaptureTarget] = useState<string>("");
  const [goalNames, setGoalNames] = useState<Map<string, string>>(() => new Map());
  const [retentionWindow, setRetentionWindow] = usePreference("modules.retention");
  const [retentionScope, setRetentionScope] = usePreference("modules.retentionScope");
  const [retention, setRetention] = useState<RetentionPolicy>(defaultRetention);
  const retentionChangedByUser = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cleaned, setCleaned] = useState<{ items: number; groups: number } | null>(null);
  const [undo, setUndo] = useState<{ item: ChecklistItem; listId: string } | null>(null);
  const undoTimer = useRef<number | null>(null);
  const composerRefs = useRef(new Map<string, HTMLInputElement>());
  const captureRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setChecklists(inPositionOrder(await fetchChecklists()));
      try {
        const goals = await fetchGoals();
        setGoalNames(new Map(goals.flatMap((group) => group.goals.map((goal) => [goal.id, goal.title] as const))));
      } catch {
        // A goal name is context, not data this page owns; losing it must not block the list.
      }
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  // One mount pass: plan the cleanup, run it once, then read the surviving list.
  useEffect(() => {
    if (retentionChangedByUser.current) return;
    const policy = readRetention(retentionWindow, retentionScope);
    setRetention(policy);
    const start = async () => {
      if (policy.days !== null) {
        try {
          const result = await pruneChecklists({ olderThanDays: policy.days, scope: policy.scope });
          if (result.deletedItems > 0 || result.deletedGroups > 0) {
            setCleaned({ items: result.deletedItems, groups: result.deletedGroups });
          }
        } catch {
          // A cleanup that cannot run must never block the list.
        }
      }
      await load();
    };
    void start();
  }, [load, retentionWindow, retentionScope]);

  useEffect(() => {
    if (checklists.length === 0) {
      if (captureTarget !== "") setCaptureTarget("");
      return;
    }
    if (!checklists.some((checklist) => checklist.id === captureTarget)) setCaptureTarget(checklists[0]!.id);
    if (focusedGroup !== null && !checklists.some((checklist) => checklist.id === focusedGroup)) setFocusedGroup(null);
  }, [checklists, captureTarget, focusedGroup]);

  const today = todayKey();
  const yesterday = shiftDay(today, -1);
  const dayLabels = { today: t("tasks.today"), yesterday: t("tasks.yesterday") };
  const entries = useMemo<Entry[]>(
    () => checklists.flatMap((checklist) => checklist.items.map((item) => ({ item, groupName: checklist.name }))),
    [checklists],
  );
  const byCreatedAsc = (left: Entry, right: Entry) => left.item.createdAt.localeCompare(right.item.createdAt);

  // A check belongs to the day it was written, or to the day it is due when that lands inside the window.
  const bucketOf = useCallback(
    (entry: Entry): DayKey | null => {
      const created = dayKeyOf(entry.item.createdAt);
      if (created === today || created === yesterday) return created;
      if (entry.item.dueDate === today || entry.item.dueDate === yesterday) return entry.item.dueDate;
      return null;
    },
    [today, yesterday],
  );

  const todayEntries = useMemo(
    () => entries.filter((entry) => bucketOf(entry) === today).sort(byCreatedAsc),
    [entries, bucketOf, today],
  );
  const yesterdayEntries = useMemo(
    () => entries.filter((entry) => bucketOf(entry) === yesterday).sort(byCreatedAsc),
    [entries, bucketOf, yesterday],
  );
  const pastEntries = useMemo(
    () => entries.filter((entry) => bucketOf(entry) === null),
    [entries, bucketOf],
  );

  const pastByDay = useMemo(() => {
    const groups = new Map<DayKey, Entry[]>();
    for (const entry of pastEntries) {
      const day = dayKeyOf(entry.item.createdAt);
      const bucket = groups.get(day) ?? [];
      bucket.push(entry);
      groups.set(day, bucket);
    }
    return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [pastEntries]);

  // The unclosed debt is the oldest first by default: the thing waiting longest is the thing to face.
  const debt = useMemo(() => {
    const open = pastEntries.filter(({ item }) => !item.done);
    return debtOrder === "asc"
      ? [...open].sort((left, right) => left.item.createdAt.localeCompare(right.item.createdAt))
      : [...open].sort((left, right) => right.item.createdAt.localeCompare(left.item.createdAt));
  }, [pastEntries, debtOrder]);

  // Picked from the badge row, a group is lifted to the top for this session only; positions stay untouched.
  const orderedGroups = focusedGroup === null
    ? checklists
    : [
        ...checklists.filter((checklist) => checklist.id === focusedGroup),
        ...checklists.filter((checklist) => checklist.id !== focusedGroup),
      ];

  const groupCount = checklists.length;
  const openCount = entries.filter(({ item }) => !item.done).length;
  const overdueCount = entries.filter(
    ({ item }) => !item.done && item.dueDate !== null && item.dueDate < today,
  ).length;
  const summary = `${groupCount} ${groupCount === 1 ? t("tasks.groupSingular") : t("tasks.groupPlural")} · ${openCount} ${t("tasks.open")}`;
  const captureGroup = checklists.find((checklist) => checklist.id === captureTarget);

  const retryLoad = () => void load();

  const applyRetention = (next: RetentionPolicy) => {
    retentionChangedByUser.current = true;
    setRetention(next);
    writeRetention(next, setRetentionWindow, setRetentionScope);
  };

  const runCleanup = async () => {
    if (retention.days === null) return;
    setError(null);
    try {
      const result = await pruneChecklists({ olderThanDays: retention.days, scope: retention.scope });
      setCleaned({ items: result.deletedItems, groups: result.deletedGroups });
      await load();
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const toggleDay = (day: DayKey) =>
    setCollapsedDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  const toggleGroup = (id: string) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreateGroup = async (event: FormEvent) => {
    event.preventDefault();
    const name = newGroupDraft.trim();
    if (name === "") return;

    setError(null);
    try {
      const created = await createChecklist({ name });
      setChecklists((current) => inPositionOrder([...current, created]));
      setNewGroupDraft("");
      setNewGroupOpen(false);
      setTab("groups");
      setFocusedGroup(created.id);
      setOpenComposers((current) => new Set(current).add(created.id));
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const handleRename = async (event: FormEvent, checklist: Checklist) => {
    event.preventDefault();
    const name = renameDraft.trim();
    if (name === "") {
      setError(t("tasks.groupNameRequired"));
      return;
    }
    if (name === checklist.name) {
      setRenaming(null);
      return;
    }

    setError(null);
    try {
      const updated = await updateChecklist(checklist.id, { name });
      setChecklists((current) => inPositionOrder(current.map((entry) => (entry.id === updated.id ? { ...entry, ...updated, items: entry.items } : entry))));
      setRenaming(null);
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const handleDeleteGroup = async () => {
    if (deleteTarget === null) return;
    setDeletingList(true);
    setError(null);
    try {
      await deleteChecklist(deleteTarget.id);
      setChecklists((current) => current.filter((entry) => entry.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setDeletingList(false);
    }
  };

  const addItem = async (listId: string, text: string) => {
    setError(null);
    try {
      const created = await createChecklistItem(listId, { text });
      setChecklists((current) => current.map((entry) =>
        entry.id === listId ? { ...entry, items: [...entry.items, created] } : entry,
      ));
      return true;
    } catch (failure) {
      setError(messageOf(failure));
      return false;
    }
  };

  /** A check needs a group; the first one creates the default group so the page is usable from zero. */
  const resolveCaptureTarget = async (): Promise<string | null> => {
    if (captureTarget !== "") return captureTarget;
    if (checklists.length > 0) return checklists[0]!.id;

    setError(null);
    try {
      const created = await createChecklist({ name: "Inbox" });
      setChecklists(inPositionOrder([created]));
      setCaptureTarget(created.id);
      return created.id;
    } catch (failure) {
      setError(messageOf(failure));
      return null;
    }
  };

  const handleCapture = async (event: FormEvent) => {
    event.preventDefault();
    const { text, groupName } = parseCapture(capture);
    if (text === "") return;

    let target = captureTarget;
    if (groupName !== null) {
      const existing = checklists.find((entry) => entry.name.toLowerCase() === groupName.toLowerCase());
      if (existing) {
        target = existing.id;
      } else {
        setError(null);
        try {
          const created = await createChecklist({ name: groupName });
          setChecklists((current) => inPositionOrder([...current, created]));
          setCaptureTarget(created.id);
          target = created.id;
        } catch (failure) {
          setError(messageOf(failure));
          return;
        }
      }
    } else {
      const resolved = await resolveCaptureTarget();
      if (resolved === null) return;
      target = resolved;
    }

    const added = await addItem(target, text);
    if (added) {
      setCapture("");
      captureRef.current?.focus();
    }
  };

  const handleComposer = async (event: FormEvent, listId: string) => {
    event.preventDefault();
    const text = (composers[listId] ?? "").trim();
    if (text === "") return;

    const added = await addItem(listId, text);
    if (added) {
      setComposers((current) => ({ ...current, [listId]: "" }));
      composerRefs.current.get(listId)?.focus();
    }
  };

  const handleToggle = async (item: ChecklistItem) => {
    const done = !item.done;
    setError(null);
    setPendingItems((current) => new Set(current).add(item.id));
    setChecklists((current) => replaceItem(current, { ...item, done }));
    try {
      const updated = await updateChecklistItem(item.id, { done });
      setChecklists((current) => replaceItem(current, updated));
    } catch (failure) {
      setChecklists((current) => replaceItem(current, item));
      setError(messageOf(failure));
    } finally {
      setPendingItems((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleDeleteItem = async (item: ChecklistItem) => {
    setError(null);
    try {
      await deleteChecklistItem(item.id);
      setChecklists((current) => current.map((entry) => ({
        ...entry,
        items: entry.items.filter(({ id }) => id !== item.id),
      })));
      setUndo({ item, listId: item.listId });
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndo(null), 8000);
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const handleUndo = async () => {
    if (undo === null) return;
    const { item, listId } = undo;
    setUndo(null);
    setError(null);
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    try {
      const restored = await createChecklistItem(listId, { text: item.text });
      const patch: UpdateChecklistItemInput = {};
      if (item.priority !== "none") patch.priority = item.priority;
      if (item.dueDate !== null) patch.dueDate = item.dueDate;
      if (item.recurrence !== "none") patch.recurrence = item.recurrence;
      if (item.done) patch.done = true;
      const final = Object.keys(patch).length > 0 ? await updateChecklistItem(restored.id, patch) : restored;
      setChecklists((current) => current.map((entry) =>
        entry.id === listId ? { ...entry, items: [...entry.items, final] } : entry,
      ));
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const handleBulk = async (checklist: Checklist, action: ChecklistBulkAction) => {
    setError(null);
    try {
      const updated = await bulkChecklists(checklist.id, action);
      setChecklists((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const handlePatch = async (item: ChecklistItem, patch: UpdateChecklistItemInput) => {
    setError(null);
    try {
      const updated = await updateChecklistItem(item.id, patch);
      setChecklists((current) => replaceItem(current, updated));
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const row = (entry: Entry, options: { group: boolean; due: boolean }) => (
    <TaskRow
      key={entry.item.id}
      entry={entry}
      today={today}
      locale={locale}
      t={t}
      pending={pendingItems.has(entry.item.id)}
      showGroup={options.group}
      showDueControl={options.due}
      goalName={entry.item.goalId === null ? null : goalNames.get(entry.item.goalId) ?? null}
      onToggle={(item) => void handleToggle(item)}
      onDelete={(item) => void handleDeleteItem(item)}
      onPriority={(item, priority) => void handlePatch(item, { priority })}
      onDueDate={(item, dueDate) => void handlePatch(item, { dueDate })}
      onRecurrence={(item, recurrence) =>
        void handlePatch(item, recurrence === "none" ? { recurrence } : { recurrence, dueDate: item.dueDate ?? today })
      }
      showRecurrenceControl={options.due}
    />
  );

  const newGroupControl = newGroupOpen ? (
    <form className="flex items-center gap-1.5" onSubmit={(event) => void handleCreateGroup(event)}>
      <Input
        aria-label={t("tasks.groupNewName")}
        placeholder={t("tasks.groupPlaceholder")}
        value={newGroupDraft}
        onChange={(event) => setNewGroupDraft(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Escape") {
            setNewGroupOpen(false);
            setNewGroupDraft("");
          }
        }}
        autoFocus
        className="h-9 min-w-0 flex-1 text-sm"
      />
      <Button type="submit" variant="ghost" aria-label={t("tasks.createGroup")} disabled={newGroupDraft.trim() === ""} className="h-9 px-3 text-xs">
        Create
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-9 px-2 text-xs"
        onClick={() => {
          setNewGroupOpen(false);
          setNewGroupDraft("");
        }}
      >
        Cancel
      </Button>
    </form>
  ) : (
    <Button type="button" variant="ghost" onClick={() => setNewGroupOpen(true)} className="h-9 gap-1.5 px-2 text-sm text-muted-foreground">
      <Plus size={15} aria-hidden="true" />
      New group
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col px-4 pt-8 pb-24 sm:px-6">
      <header className="flex items-center gap-2">
        <Link
          to="/"
          aria-label={t("tasks.homeLabel")}
          title={t("tasks.home")}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"
        >
          <House size={15} aria-hidden="true" />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("tasks.title")}</h1>
        <div className="ml-auto flex items-center gap-1">
          {overdueCount > 0 ? (
            <span className="text-xs tabular-nums text-destructive">{t("tasks.overdueCount", { count: overdueCount })}</span>
          ) : null}
          {groupCount > 0 ? (
            <span className="pr-1 text-xs tabular-nums text-muted-foreground">{summary}</span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("tasks.cleanupSettings")}
            onClick={() => setSettingsOpen(true)}
            className="size-8 rounded-md text-muted-foreground"
          >
            <Settings2 size={15} aria-hidden="true" />
          </Button>
          <div className="[&>button]:size-8">
            <ThemeToggle />
          </div>
          <LanguageToggle />
        </div>
      </header>

      {error === null ? null : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-l-2 border-destructive py-1 pl-3">
          <p role="alert" className="text-[13px] leading-5 text-destructive">{error}</p>
          <Button type="button" variant="ghost" className="h-8 px-2 text-xs text-destructive hover:text-destructive" onClick={retryLoad}>
            {t("tasks.retry")}
          </Button>
        </div>
      )}

      {cleaned === null ? null : (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("tasks.cleaned", { items: cleaned.items, checks: cleaned.items === 1 ? t("tasks.check") : t("tasks.checks"), groups: cleaned.groups === 0 ? "" : cleaned.groups === 1 ? t("tasks.cleanupGroupOne", { count: cleaned.groups }) : t("tasks.cleanupGroupsMany", { count: cleaned.groups }) })}
        </p>
      )}

      {!loading ? (
        <div role="group" aria-label={t("tasks.view")} className="mt-4 inline-flex items-center gap-0.5 self-start">
          {(["today", "groups"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none",
                tab === value && "bg-muted text-foreground",
              )}
            >
              {value === "today" ? t("tasks.todayTab") : t("tasks.groups")}
            </Button>
          ))}
        </div>
      ) : null}

      {!loading ? (
        <form onSubmit={(event) => void handleCapture(event)} className="sticky top-4 z-20 mt-4 flex items-stretch overflow-hidden rounded-lg border border-border bg-background">
          <Input
            ref={captureRef}
            aria-label={t("tasks.newCheck")}
            placeholder={t("tasks.newCheckPlaceholder")}
            value={capture}
            onChange={(event) => setCapture(event.target.value)}
            className="h-11 min-w-0 flex-1 rounded-none border-0 px-3 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {groupCount > 1 ? (
            <div className="flex items-center border-l border-border pl-1">
              <Select value={captureTarget} onValueChange={(value) => value && setCaptureTarget(value)}>
                <SelectTrigger aria-label={t("tasks.group")} className="h-9 gap-1 border-0 px-2 text-xs text-muted-foreground shadow-none">
                  <SelectValue>{(value: string) => checklists.find((entry) => entry.id === value)?.name ?? t("tasks.group")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {checklists.map((checklist) => (
                    <SelectItem key={checklist.id} value={checklist.id} className="min-h-9 text-sm">
                      {checklist.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Button
            type="submit"
            variant="ghost"
            aria-label={captureGroup ? t("tasks.addCheckTo", { name: captureGroup.name }) : t("tasks.addCheck")}
            className="mr-1 size-9 shrink-0 self-center rounded-md"
          >
            <Plus size={16} aria-hidden="true" />
          </Button>
        </form>
      ) : null}

      {loading ? (
        <div className="mt-8">
          <LoadingSkeleton label={t("tasks.loading")} />
        </div>
      ) : null}

      {!loading && tab === "today" ? (
        <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <DayBlock
              day={today}
              label={dayLabel(today, today, locale, dayLabels)}
              entries={todayEntries.filter(({ item }) => !item.done).length}
              open={!collapsedDays.has(today)}
              onToggle={() => toggleDay(today)}
            >
              {todayEntries.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">{t("tasks.nothingToday")}</p>
              ) : (
                <ul className="divide-y divide-border/60" aria-label={t("tasks.newChecks")}>
                  {todayEntries.map((entry) => row(entry, { group: true, due: false }))}
                </ul>
              )}
            </DayBlock>

            <DayBlock
              day={yesterday}
              label={dayLabel(yesterday, today, locale, dayLabels)}
              entries={yesterdayEntries.filter(({ item }) => !item.done).length}
              open={!collapsedDays.has(yesterday)}
              onToggle={() => toggleDay(yesterday)}
            >
              {yesterdayEntries.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">{t("tasks.nothingYesterday")}</p>
              ) : (
                <ul className="divide-y divide-border/60" aria-label={t("tasks.yesterdayChecks")}>
                  {yesterdayEntries.map((entry) => row(entry, { group: true, due: false }))}
                </ul>
              )}
            </DayBlock>

            {pastEntries.length === 0 ? null : (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={showPast}
                  onClick={() => setShowPast((current) => !current)}
                  className="h-8 gap-1 px-1.5 text-xs text-muted-foreground"
                >
                  <ChevronDown
                    size={13}
                    aria-hidden="true"
                    className={cn("transition-transform duration-150 motion-reduce:transition-none", !showPast && "-rotate-90")}
                  />
                  {showPast ? t("tasks.hidePast") : t("tasks.pastDays", { count: pastEntries.length })}
                </Button>

                {showPast ? (
                  <div className="mt-4 flex flex-col gap-6">
                    {pastByDay.map(([day, dayEntries]) => (
                      <DayBlock
                        key={day}
                        day={day}
                        label={dayLabel(day, today, locale, dayLabels)}
                        entries={dayEntries.filter(({ item }) => !item.done).length}
                        open={!collapsedDays.has(day)}
                        onToggle={() => toggleDay(day)}
                      >
                        <ul className="divide-y divide-border/60" aria-label={`${dayLabel(day, today, locale, dayLabels)} checks`}>
                          {dayEntries.map((entry) => row(entry, { group: true, due: false }))}
                        </ul>
                      </DayBlock>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <aside aria-labelledby="debt-heading" className="min-w-0 border-t border-border pt-4 lg:border-t-0 lg:pt-0">
            <div className="flex items-baseline gap-2 border-b border-border pb-1.5">
              <h2 id="debt-heading" className="text-[13px] font-medium text-muted-foreground">{t("tasks.notClosed")}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{debt.length}</span>
              {debt.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setDebtOrder((current) => (current === "asc" ? "desc" : "asc"))}
                  className="ml-auto text-[11px] text-muted-foreground underline decoration-border underline-offset-2 transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
                >
                  {debtOrder === "asc" ? t("tasks.oldestFirst") : t("tasks.newestFirst")}
                </button>
              ) : null}
            </div>

            {debt.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">{t("tasks.nothingOpen")}</p>
            ) : (
              <ul aria-label={t("tasks.unclosed")} className="max-h-[420px] divide-y divide-border/60 overflow-y-auto">
                {debt.map((entry) => {
                  const day = dayKeyOf(entry.item.createdAt);
                  return (
                    <li key={entry.item.id} className="flex min-h-11 items-center gap-2 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        role="checkbox"
                        aria-label={entry.item.text}
                        aria-checked={false}
                        disabled={pendingItems.has(entry.item.id)}
                        onClick={() => void handleToggle(entry.item)}
                        className="size-9 shrink-0 rounded-md p-0 text-muted-foreground transition-colors duration-150 motion-reduce:transition-none"
                      >
                        <span className="flex size-[18px] items-center justify-center rounded-[5px] border border-border" aria-hidden="true" />
                      </Button>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-[13px] leading-5 text-foreground">
                          {entry.item.priority === "none" ? null : (
                            <span
                              className={cn("size-1.5 shrink-0 rounded-full", priorityStyles[entry.item.priority].dot)}
                              title={priorityStyles[entry.item.priority].label}
                            />
                          )}
                          <span className="truncate">{entry.item.text}</span>
                        </p>
                        <p className="truncate text-[11px] leading-4 text-muted-foreground">
                          {entry.groupName} · <time dateTime={day}>{shortDayLabel(day, today, locale)}</time>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      ) : null}

      {!loading && tab === "groups" ? (
        <div className="mt-8 flex flex-col gap-7">
          {checklists.length > 0 ? (
            <div role="group" aria-label={t("tasks.groupJump")} className="-mb-2 flex gap-1 overflow-x-auto pb-1">
              {checklists.map((checklist) => (
                <button
                  key={checklist.id}
                  type="button"
                  aria-pressed={focusedGroup === checklist.id}
                  onClick={() => setFocusedGroup((current) => (current === checklist.id ? null : checklist.id))}
                  className={cn(
                    "h-6 shrink-0 rounded-md border px-2 text-[11px] transition-colors duration-150 motion-reduce:transition-none",
                    focusedGroup === checklist.id
                      ? "border-foreground/30 bg-muted text-foreground"
                      : "border-border/70 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                  )}
                >
                  {checklist.name}
                </button>
              ))}
            </div>
          ) : null}
          {checklists.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("tasks.noGroups")}
            </p>
          ) : null}
          {orderedGroups.map((checklist) => {
            const open = checklist.items.filter(({ done }) => !done).length;
            const composing = openComposers.has(checklist.id);
            const collapsed = collapsedGroups.has(checklist.id);
            return (
              <section key={checklist.id} aria-labelledby={`group-${checklist.id}`} className="min-w-0">
                <header className="flex min-h-9 items-center gap-2 border-b border-border pb-1.5">
                  {renaming?.id === checklist.id ? (
                    <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(event) => void handleRename(event, checklist)}>
                      <Input
                        aria-label={t("tasks.renameGroup", { name: checklist.name })}
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                          if (event.key === "Escape") setRenaming(null);
                        }}
                        autoFocus
                        className="h-8 min-w-0 flex-1 px-2 text-sm"
                      />
                      <Button type="submit" variant="ghost" aria-label={t("tasks.saveGroupName")} className="size-8 shrink-0">
                        <Check size={15} aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" aria-label={t("tasks.cancelRenameGroup")} className="size-8 shrink-0" onClick={() => setRenaming(null)}>
                        <X size={15} aria-hidden="true" />
                      </Button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      onClick={() => toggleGroup(checklist.id)}
                      className="flex min-w-0 items-center gap-1.5 text-left"
                    >
                      <ChevronRight
                        size={13}
                        aria-hidden="true"
                        className={cn(
                          "shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                          !collapsed && "rotate-90",
                        )}
                      />
                      <h2 id={`group-${checklist.id}`} className="min-w-0 truncate text-[15px] leading-6 font-medium text-foreground">
                        {checklist.name}
                      </h2>
                    </button>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t("tasks.groupOpenCount", { count: open })}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Add a check to ${checklist.name}`}
                      aria-expanded={composing}
                      className="size-8 rounded-md"
                      onClick={() => setOpenComposers((current) => {
                        const next = new Set(current);
                        if (next.has(checklist.id)) next.delete(checklist.id);
                        else next.add(checklist.id);
                        return next;
                      })}
                    >
                      <Plus size={15} aria-hidden="true" />
                    </Button>
                    <BaseMenu.Root>
                      <BaseMenu.Trigger
                        render={<Button type="button" variant="ghost" aria-label={t("tasks.groupActions", { name: checklist.name })} className="size-8 rounded-md text-muted-foreground" />}
                      >
                        <MoreHorizontal size={15} aria-hidden="true" />
                      </BaseMenu.Trigger>
                      <MenuPopup align="end">
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-9")}
                          onClick={() => {
                            setRenaming({ id: checklist.id, name: checklist.name });
                            setRenameDraft(checklist.name);
                          }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                          {t("tasks.rename")}
                        </BaseMenu.Item>
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-9", open === 0 && "opacity-50")}
                          disabled={open === 0}
                          onClick={() => void handleBulk(checklist, "complete-open")}
                        >
                          <Check size={14} aria-hidden="true" />
                          {t("tasks.closeAllOpen")}
                        </BaseMenu.Item>
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-9", checklist.items.length === open && "opacity-50")}
                          disabled={checklist.items.length === open}
                          onClick={() => void handleBulk(checklist, "delete-completed")}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          {t("tasks.deleteCompleted")}
                        </BaseMenu.Item>
                        <BaseMenu.Item
                          className={cn(menuItemClassName, "min-h-9 text-destructive hover:text-destructive")}
                          onClick={() => setDeleteTarget(checklist)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          {t("tasks.deleteGroup")}
                        </BaseMenu.Item>
                      </MenuPopup>
                    </BaseMenu.Root>
                  </div>
                </header>

                {collapsed ? null : (
                  <>
                    {checklist.items.length === 0 && !composing ? (
                      <p className="py-2 text-xs text-muted-foreground">{t("tasks.emptyGroup")}</p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {checklist.items.map((item) => row({ item, groupName: checklist.name }, { group: false, due: true }))}
                      </ul>
                    )}

                    {composing ? (
                      <form className="mt-1 flex items-center gap-1.5 py-1" onSubmit={(event) => void handleComposer(event, checklist.id)}>
                        <span className="flex size-9 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
                          <Plus size={14} />
                        </span>
                        <Input
                          ref={(element) => {
                            if (element) composerRefs.current.set(checklist.id, element);
                            else composerRefs.current.delete(checklist.id);
                          }}
                          aria-label={`Add a check to ${checklist.name}`}
                          placeholder={t("tasks.addCheck")}
                          autoFocus
                          value={composers[checklist.id] ?? ""}
                          onChange={(event) => setComposers((current) => ({ ...current, [checklist.id]: event.target.value }))}
                          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                            if (event.key === "Escape") {
                              setComposers((current) => ({ ...current, [checklist.id]: "" }));
                              setOpenComposers((current) => {
                                const next = new Set(current);
                                next.delete(checklist.id);
                                return next;
                              });
                            }
                          }}
                          className="h-9 min-w-0 flex-1 border-0 px-1 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          aria-label={t("tasks.saveCheck", { name: checklist.name })}
                          disabled={(composers[checklist.id] ?? "").trim() === ""}
                          className="size-9 shrink-0 rounded-md"
                        >
                          <Check size={15} aria-hidden="true" />
                        </Button>
                      </form>
                    ) : null}
                  </>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {!loading && tab === "groups" ? (
        <div className="mt-9 border-t border-border pt-4">{newGroupControl}</div>
      ) : null}

      {undo === null ? null : (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-none"
        >
          <span className="min-w-0 truncate text-muted-foreground">{t("tasks.undoDeleted", { name: undo.item.text })}</span>
          <Button type="button" variant="ghost" onClick={() => void handleUndo()} className="h-7 shrink-0 px-2 text-xs">
            {t("tasks.undo")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("tasks.dismiss")}
            onClick={() => setUndo(null)}
            className="size-7 shrink-0 p-0 text-muted-foreground"
          >
            <X size={12} aria-hidden="true" />
          </Button>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogPortal>
          <DialogBackdrop className="motion-reduce:transition-none" />
          <DialogPopup className="transition-opacity duration-200 motion-reduce:transition-none">
            <DialogHeader>
              <div className="flex flex-col gap-1">
                <DialogTitle>{t("tasks.cleanup")}</DialogTitle>
                <DialogDescription>{t("tasks.settingsDescription")}</DialogDescription>
              </div>
              <DialogCloseIcon aria-label={t("tasks.closeDialog")} className="size-11" />
            </DialogHeader>
            <DialogBody className="space-y-5">
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{t("tasks.keepFor")}</p>
                <div role="radiogroup" aria-label={t("tasks.retention")} className="inline-flex flex-wrap items-center gap-0.5">
                  {retentionChoices.map((choice) => (
                    <Button
                      key={choice.label}
                      type="button"
                      variant="ghost"
                      role="radio"
                      aria-checked={retention.days === choice.days}
                      onClick={() => applyRetention({ ...retention, days: choice.days })}
                      className={cn(
                        "h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none",
                        retention.days === choice.days && "bg-muted text-foreground",
                      )}
                    >
                      {choice.days === null ? t("tasks.never") : t("tasks.retentionDays", { days: choice.days })}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">{t("tasks.remove")}</p>
                <div role="radiogroup" aria-label={t("tasks.scope")} className="inline-flex flex-wrap items-center gap-0.5">
                  {([["completed", t("tasks.completedOnly")], ["all", t("tasks.allChecks")]] as Array<[RetentionScope, string]>).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant="ghost"
                      role="radio"
                      aria-checked={retention.scope === value}
                      disabled={retention.days === null}
                      onClick={() => applyRetention({ ...retention, scope: value })}
                      className={cn(
                        "h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none",
                        retention.scope === value && retention.days !== null && "bg-muted text-foreground",
                      )}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  {t("tasks.retentionCompletedNote")}
                </p>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" className="h-9" onClick={() => setSettingsOpen(false)}>
                {t("tasks.doneButton")}
              </Button>
              <Button type="button" className="h-9" disabled={retention.days === null} onClick={() => void runCleanup()}>
                {t("tasks.cleanNow")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </DialogPortal>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogPortal>
          <DialogBackdrop className="motion-reduce:transition-none" />
          <DialogPopup className="transition-opacity duration-200 motion-reduce:transition-none">
            <DialogHeader>
              <div className="flex flex-col gap-1">
                <DialogTitle>{t("tasks.deleteGroupConfirm")}</DialogTitle>
                <DialogDescription>
                  {deleteTarget === null ? "" : t("tasks.deleteGroupDescription", { name: deleteTarget.name })}
                </DialogDescription>
              </div>
              <DialogCloseIcon aria-label={t("tasks.closeDialog")} className="size-11" />
            </DialogHeader>
            <DialogBody>
              <p className="text-sm text-muted-foreground">{t("tasks.emptyGroupName")}</p>
            </DialogBody>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="ghost" className="h-9" />}>{t("tasks.cancel")}</DialogClose>
              <Button type="button" variant="destructive" disabled={deletingList} onClick={() => void handleDeleteGroup()} className="h-9">
                {t("tasks.deleteGroup")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
