import { useCallback, useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { ArrowLeft, CalendarRange, Check, ChevronDown, LayoutGrid, Plus, X } from "lucide-react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Link, useParams } from "react-router-dom";
import { NoteEditor } from "@/components/editor/note-editor";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogBody,
  DialogCloseIcon,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MenuPopup, menuItemClassName } from "@/components/ui/menu";
import { EditorBridgeProvider, EditorHistoryControls } from "@/features/editor/editor-bridge";
import { useAutosave } from "@/features/editor/use-autosave";
import {
  fetchChecklists,
  updateChecklistItem,
  type ChecklistItem,
} from "@/features/tasks/tasks-api";
import { fetchTasksByGoal, updateTask, type GoalLinkedTask } from "@/features/projects/projects-api";
import { uploadImage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  fetchGoal,
  fetchGoalVocabulary,
  fetchGoals,
  updateGoal,
  type Category,
  type Goal,
  type GoalStatus,
  type GoalVocabulary,
} from "./goals-api";
import { TagInput } from "./tag-input";

type PageState =
  | { status: "loading" }
  | { status: "ready"; goal: Goal; groupName: string; vocabulary: GoalVocabulary }
  | { status: "error"; message: string }
  | { status: "not-found" };

type GoalDraft = {
  title: string;
  content: JSONContent;
  categoryName: string | null;
  tagNames: string[];
  dueDate: string | null;
  status: GoalStatus;
};

const statusStyles: Record<GoalStatus, { dot: string; text: string }> = {
  todo: { dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  doing: { dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  done: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
};

function statusLabel(status: GoalStatus, t: (key: string) => string): string {
  return t(status === "todo" ? "goals.statusTodo" : status === "doing" ? "goals.statusDoing" : "goals.statusDone");
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : "unknown_error";
}

function shortDate(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
    new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12),
  );
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function GoalBody({
  goal,
  groupName,
  initialVocabulary,
}: {
  goal: Goal;
  groupName: string;
  initialVocabulary: GoalVocabulary;
}) {
  const { locale, t } = useT();
  const [draft, setDraft] = useState<GoalDraft>(() => ({
    title: goal.title,
    content: goal.content,
    categoryName: goal.category?.name ?? null,
    tagNames: goal.tags.map(({ name }) => name),
    dueDate: goal.dueDate,
    status: goal.status,
  }));
  const [categories, setCategories] = useState<Category[]>(initialVocabulary.categories);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [tasks, setTasks] = useState<ChecklistItem[]>([]);
  const [boardTasks, setBoardTasks] = useState<GoalLinkedTask[]>([]);

  const save = useCallback(async (next: GoalDraft) => {
    try {
      await updateGoal(goal.id, {
        title: next.title,
        content: next.content,
        categoryName: next.categoryName,
        tagNames: next.tagNames,
        dueDate: next.dueDate,
        status: next.status,
      });
      setSaveError(null);
    } catch (failure) {
      setSaveError(messageOf(failure));
      throw failure;
    }
  }, [goal.id]);

  const autosave = useAutosave(save);

  const updateDraft = (next: GoalDraft) => {
    setDraft(next);
    setSaveError(null);
    autosave.scheduleSave(next);
  };

  // Tasks live in their own module; the goal only reads the list to offer and show the link.
  const loadTasks = useCallback(async () => {
    try {
      setTasks((await fetchChecklists()).flatMap((checklist) => checklist.items));
    } catch {
      // Linking is a convenience: a failed read must not break the goal itself.
    }
    try {
      setBoardTasks(await fetchTasksByGoal(goal.id));
    } catch {
      // Board tasks are a second source; the checks still render without them.
    }
  }, [goal.id]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const linked = tasks.filter((task) => task.goalId === goal.id);
  const linkable = tasks.filter((task) => task.goalId === null && !task.done);

  const patchTask = async (task: ChecklistItem, patch: { done?: boolean; goalId?: string | null }) => {
    try {
      const updated = await updateChecklistItem(task.id, patch);
      setTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (failure) {
      setSaveError(messageOf(failure));
    }
  };

  const unlinkBoardTask = async (task: GoalLinkedTask) => {
    try {
      await updateTask(task.id, { goalId: null });
      setBoardTasks((current) => current.filter((entry) => entry.id !== task.id));
    } catch (failure) {
      setSaveError(messageOf(failure));
    }
  };

  const addCategory = () => {
    const name = categoryDraft.trim();
    if (name === "") return;
    const existing = categories.find(({ name: existingName }) => existingName.toLowerCase() === name.toLowerCase());
    const category = existing ?? { id: `local-${name.toLowerCase()}`, name };
    setCategories((current) => existing ? current : [...current, category]);
    updateDraft({ ...draft, categoryName: category.name });
    setCategoryDraft("");
    setAddingCategory(false);
  };

  const status = autosave.status;
  const today = todayKey();
  const overdue = draft.dueDate !== null && draft.dueDate < today && draft.status !== "done";

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 pt-5 pb-20 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border/70 pb-4">
        <nav aria-label={t("goals.goalNavigation")}>
          <Link
            to="/goals"
            aria-label={t("goals.back")}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {t("goals.title")}
          </Link>
          <span className="px-2 text-sm text-muted-foreground" aria-hidden="true">/</span>
          <span className="text-[13px] text-muted-foreground">{groupName}</span>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span role="status" aria-live="polite" className="min-h-5 min-w-[4.5rem] text-right text-xs tabular-nums text-muted-foreground">
            {status === "Idle" ? "" : status === "Saving…" ? t("goals.statusSaving") : status === "Saved" ? t("goals.statusSaved") : t("goals.statusError")}
          </span>
          <div className="flex items-center gap-1">
            <EditorHistoryControls />
            <div className="[&_button]:!size-11">
              <ThemeToggle />
            </div>
            <LanguageToggle />
          </div>
        </div>
      </header>

      {saveError ? (
        <div role="alert" className="mt-5 border-y border-destructive/30 py-3 text-[13px] leading-5 text-destructive">
          {t("goals.goalSaveError", { error: saveError })}
        </div>
      ) : null}

      <div className="mt-7 max-w-[760px]">
        <h1 className="sr-only">{draft.title || t("goals.untitled")}</h1>
        <Input
          id="goal-title"
          aria-label={t("goals.titleLabel")}
          placeholder={t("goals.untitled")}
          value={draft.title}
          onChange={(event) => updateDraft({ ...draft, title: event.target.value })}
          className="h-auto min-h-11 rounded-none border-0 bg-transparent px-0 py-0.5 text-[26px] leading-tight font-semibold tracking-tight shadow-none md:text-[26px] focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-transparent"
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label={t("goals.statusGoal")} className="inline-flex items-center gap-0.5">
            {(["todo", "doing", "done"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                aria-pressed={draft.status === value}
                onClick={() => updateDraft({ ...draft, status: value })}
                className={cn(
                  "h-7 gap-1.5 rounded px-1.5 text-[11px] transition-colors duration-150 motion-reduce:transition-none",
                  statusStyles[value].text,
                  draft.status === value && "bg-muted",
                )}
              >
                <span className={cn("size-1.5 rounded-full", statusStyles[value].dot)} aria-hidden="true" />
                {statusLabel(value, t)}
              </Button>
            ))}
          </div>

          <span className="text-muted-foreground/40" aria-hidden="true">·</span>

          {dueOpen ? (
            <input
              type="date"
              aria-label={t("goals.goalDueDate")}
              autoFocus
              defaultValue={draft.dueDate ?? ""}
              onChange={(event) => {
                updateDraft({ ...draft, dueDate: event.target.value === "" ? null : event.target.value });
                setDueOpen(false);
              }}
              onBlur={() => setDueOpen(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setDueOpen(false);
              }}
              className="h-7 rounded border border-input bg-transparent px-1 text-[11px] text-foreground"
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDueOpen(true)}
              aria-label={draft.dueDate === null ? t("goals.dueSet") : t("goals.due", { date: draft.dueDate })}
              className={cn(
                "h-7 gap-1 rounded px-1.5 text-[11px] transition-colors duration-150 motion-reduce:transition-none",
                overdue ? "text-destructive" : "text-muted-foreground",
              )}
            >
              <CalendarRange size={11} aria-hidden="true" />
              {draft.dueDate === null ? t("goals.dueDate") : shortDate(draft.dueDate, locale)}
            </Button>
          )}

          <span className="text-muted-foreground/40" aria-hidden="true">·</span>

          <BaseMenu.Root>
            <BaseMenu.Trigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t("goals.categoryLabel", { name: draft.categoryName ?? t("goals.categoryNone") })}
                  className="h-7 gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors duration-150 motion-reduce:transition-none"
                />
              }
            >
              {draft.categoryName ?? t("goals.category")}
              <ChevronDown size={11} aria-hidden="true" />
            </BaseMenu.Trigger>
            <MenuPopup align="start">
              <BaseMenu.Item
                className={cn(menuItemClassName, "min-h-9 text-xs")}
                onClick={() => updateDraft({ ...draft, categoryName: null })}
              >
                {t("goals.noCategory")}
              </BaseMenu.Item>
              {categories.map((category) => (
                <BaseMenu.Item
                  key={category.id}
                  className={cn(menuItemClassName, "min-h-9 text-xs")}
                  onClick={() => updateDraft({ ...draft, categoryName: category.name })}
                >
                  {category.name}
                  {draft.categoryName === category.name ? <Check size={12} className="ml-auto" aria-hidden="true" /> : null}
                </BaseMenu.Item>
              ))}
              <BaseMenu.Item
                className={cn(menuItemClassName, "min-h-9 text-xs")}
                onClick={() => {
                  setAddingCategory(true);
                  setCategoryDraft("");
                }}
              >
                {t("goals.newCategoryMenu")}
              </BaseMenu.Item>
            </MenuPopup>
          </BaseMenu.Root>

          <span className="text-muted-foreground/40" aria-hidden="true">·</span>

          <TagInput
            value={draft.tagNames}
            onChange={(tagNames) => updateDraft({ ...draft, tagNames })}
            vocabulary={initialVocabulary.tags}
          />
        </div>

        {addingCategory ? (
          <form
            className="mt-3 max-w-[22rem]"
            onSubmit={(event) => {
              event.preventDefault();
              addCategory();
            }}
          >
            <label htmlFor="new-goal-category" className="mb-1 block text-[12px] text-muted-foreground">{t("goals.newCategoryLabel")}</label>
            <Input
              id="new-goal-category"
              aria-label={t("goals.newCategoryLabel")}
              placeholder={t("goals.categoryPlaceholder")}
              value={categoryDraft}
              onChange={(event) => setCategoryDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setAddingCategory(false);
                  setCategoryDraft("");
                }
              }}
              className="h-9"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t("goals.categoryEnter")}</p>
          </form>
        ) : null}
      </div>

      <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <section aria-label={t("goals.document")} className="min-w-0 border-t border-border/70 pt-5 lg:border-t-0 lg:pt-0">
          <NoteEditor
            key={goal.id}
            value={draft.content}
            onChange={(content) => updateDraft({ ...draft, content })}
            placeholder={t("goals.editorPlaceholder")}
            uploadImage={uploadImage}
            className="[&_.ProseMirror]:min-h-[58vh] [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-2 [&_.ProseMirror]:text-[15px] [&_.ProseMirror]:leading-7 [&_.ProseMirror:focus-visible]:outline-2 [&_.ProseMirror:focus-visible]:outline-ring [&_.ProseMirror:focus-visible]:outline-offset-2 [&_.block-editor-add-block]:!size-11 [&_.block-editor-bubble-btn]:!min-h-11 [&_.block-editor-bubble-btn]:!min-w-11 [&_.block-editor-bubble-dropdown-item]:!min-h-11 motion-reduce:[&_.ProseMirror]:transition-none"
          />
        </section>

        <aside aria-label={t("goals.tasksFor")} className="min-w-0 border-t border-border/70 pt-4 lg:border-t-0 lg:pt-0">
          <div className="flex items-baseline gap-2 border-b border-border/70 pb-1.5">
            <h2 className="text-[13px] font-medium text-muted-foreground">{t("goals.tasks")}</h2>
            <span className="text-[11px] tabular-nums text-muted-foreground">{linked.length}</span>
          </div>

          {linked.length === 0 ? (
            <p className="py-3 text-[11px] leading-4 text-muted-foreground">{t("goals.tasksEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {linked.map((task) => (
                <li key={task.id} className="flex min-h-10 items-center gap-1.5 py-1">
                  <Button
                    type="button"
                    variant="ghost"
                    role="checkbox"
                    aria-label={task.text}
                    aria-checked={task.done}
                    onClick={() => void patchTask(task, { done: !task.done })}
                    className="size-8 shrink-0 rounded-md p-0 text-muted-foreground"
                  >
                    <span
                      className={cn(
                        "flex size-[16px] items-center justify-center rounded-[4px] border transition-colors duration-150 motion-reduce:transition-none",
                        task.done ? "border-foreground bg-foreground text-background" : "border-border",
                      )}
                      aria-hidden="true"
                    >
                      {task.done ? <Check size={10} /> : null}
                    </span>
                  </Button>
                  <span className={cn("min-w-0 flex-1 truncate text-[12px] leading-5", task.done ? "text-muted-foreground line-through decoration-border" : "text-foreground")}>
                    {task.text}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t("goals.unlink", { name: task.text })}
                    onClick={() => void patchTask(task, { goalId: null })}
                    className="size-7 shrink-0 rounded p-0 text-muted-foreground"
                  >
                    <X size={12} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {boardTasks.length === 0 ? null : (
            <ul className="divide-y divide-border/60" aria-label={t("goals.linkedBoardTasks")}>
              {boardTasks.map((task) => (
                <li key={task.id} className="flex min-h-10 items-center gap-1.5 py-1">
                  <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
                    <LayoutGrid size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/projects/${task.projectId}`}
                      className={cn("block truncate text-[12px] leading-5 hover:underline", task.isCompleted ? "text-muted-foreground line-through decoration-border" : "text-foreground")}
                    >
                      {task.title}
                    </Link>
                    <p className="truncate text-[10px] text-muted-foreground">{task.projectName} · {task.columnName}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t("goals.unlink", { name: task.title })}
                    onClick={() => void unlinkBoardTask(task)}
                    className="size-7 shrink-0 rounded p-0 text-muted-foreground"
                  >
                    <X size={12} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {linkable.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setLinkQuery("");
                setLinkOpen(true);
              }}
              className="mt-2 h-8 gap-1 rounded px-1.5 text-[11px] text-muted-foreground"
            >
              <Plus size={12} aria-hidden="true" />
              {t("goals.linkTask")}
            </Button>
          ) : null}
        </aside>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogPortal>
          <DialogBackdrop className="motion-reduce:transition-none" />
          <DialogPopup className="transition-opacity duration-200 motion-reduce:transition-none">
            <DialogHeader>
              <div className="flex flex-col gap-1">
                <DialogTitle>{t("goals.linkTask")}</DialogTitle>
                <DialogDescription>{t("goals.linkTaskDescription")}</DialogDescription>
              </div>
              <DialogCloseIcon aria-label={t("goals.close")} className="size-11" />
            </DialogHeader>
            <DialogBody className="space-y-3">
              <Input
                type="search"
                aria-label={t("goals.searchTasks")}
                placeholder={t("goals.searchTasksPlaceholder")}
                value={linkQuery}
                onChange={(event) => setLinkQuery(event.target.value)}
                autoFocus
                className="h-9"
              />
              {(() => {
                const query = linkQuery.trim().toLowerCase();
                const matching = query === ""
                  ? linkable
                  : linkable.filter((task) => task.text.toLowerCase().includes(query));
                if (matching.length === 0) {
                  return <p className="py-2 text-xs text-muted-foreground">{t("goals.noGoalMatches")}</p>;
                }
                return (
                  <ul className="max-h-[320px] divide-y divide-border/60 overflow-y-auto">
                    {matching.slice(0, 50).map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => {
                            void patchTask(task, { goalId: goal.id });
                            setLinkOpen(false);
                            setLinkQuery("");
                          }}
                          className="flex min-h-9 w-full items-center rounded-sm px-1 text-left text-sm text-foreground transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none"
                        >
                          <span className="truncate">{task.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </DialogBody>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </main>
  );
}

function GoalPageContent() {
  const { t } = useT();
  const { goalId = "" } = useParams();
  const [state, setState] = useState<PageState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [goal, groups, vocabulary] = await Promise.all([fetchGoal(goalId), fetchGoals(), fetchGoalVocabulary()]);
      const group = groups.find(({ id }) => id === goal.groupId);
      setState({ status: "ready", goal, groupName: group?.name ?? t("goals.goalGroup"), vocabulary });
    } catch (failure) {
      const message = messageOf(failure);
      setState(message === "goal_not_found" ? { status: "not-found" } : { status: "error", message });
    }
  }, [goalId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <main className="mx-auto w-full max-w-[1320px] px-4 pt-6 sm:px-6 sm:pt-8">
        <LoadingSkeleton label={t("goals.loadingGoal")} />
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main className="mx-auto w-full max-w-[1320px] px-4 pt-6 sm:px-6 sm:pt-8">
        <h1 className="text-xl font-semibold text-foreground">{t("goals.goalNotFound")}</h1>
        <Link to="/goals" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} aria-hidden="true" /> {t("goals.back")}
        </Link>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main role="alert" className="mx-auto grid w-full max-w-[1320px] gap-3 px-4 pt-6 sm:px-6 sm:pt-8">
        <h1 className="text-xl font-semibold text-foreground">{t("goals.goalError")}</h1>
        <p className="max-w-[60ch] text-sm text-destructive">{state.message}</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void load()}>{t("goals.retry")}</Button>
          <Link to="/goals" className="inline-flex min-h-11 items-center px-2 text-sm text-muted-foreground hover:text-foreground">{t("goals.back")}</Link>
        </div>
      </main>
    );
  }

  return <GoalBody key={state.goal.id} goal={state.goal} groupName={state.groupName} initialVocabulary={state.vocabulary} />;
}

export function GoalPage() {
  return (
    <EditorBridgeProvider>
      <div className="relative min-h-dvh w-full">
        <GoalPageContent />
      </div>
    </EditorBridgeProvider>
  );
}
