import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, House, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import { ProjectCard } from "./project-card";
import { ProjectDialog, type ProjectValues } from "./project-dialog";
import { TasksCalendar } from "./tasks-calendar";
import {
  createProject,
  deleteProject,
  fetchProjects,
  updateProject,
  type ProjectSummary,
} from "./projects-api";

/**
 * The projects section.
 *
 * Two views of the same work: the projects themselves, each one a row that carries a miniature of its
 * board, and the calendar, where every task that has a day to be done by lands on that day. The calendar
 * reads every project at once, and can be narrowed to one of them.
 */
export function ProjectsPage() {
  const { t } = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "calendar" ? "calendar" : "projects";
  const projectFilter = searchParams.get("project");

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [archived, setArchived] = useState<ProjectSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [active, paused] = await Promise.all([fetchProjects(), fetchProjects(true)]);
      setProjects(active);
      setArchived(paused);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setView = (next: "projects" | "calendar") => {
    const params = new URLSearchParams(searchParams);
    if (next === "calendar") params.set("view", "calendar");
    else params.delete("view");
    setSearchParams(params, { replace: true });
  };

  const setProjectFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("project");
    else params.set("project", next);
    setSearchParams(params, { replace: true });
  };

  const handleSave = async (values: ProjectValues) => {
    if (editing === null) {
      await createProject(values);
      await load();
      return;
    }
    await updateProject(editing.id, values);
    await load();
  };

  const handleArchive = async (project: ProjectSummary, archivedNext: boolean) => {
    await updateProject(project.id, { archived: archivedNext });
    await load();
  };

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    await deleteProject(deleteTarget.id);
    setDeleteTarget(null);
    await load();
  };

  const filterItems = useMemo(
    () => ({ all: t("projects.allProjects"), ...Object.fromEntries(projects.map((project) => [project.id, project.name])) }),
    [projects, t],
  );

  const projectCount = projects.length;
  const taskCount = projects.reduce((total, project) => total + project.taskCount, 0);
  const doneTaskCount = projects.reduce((total, project) => total + project.doneTaskCount, 0);
  const summary = `${projectCount === 1 ? t("projects.projectsCountOne", { count: projectCount }) : t("projects.projectsCount", { count: projectCount })} · ${taskCount === 1 ? t("projects.taskCountOne", { count: taskCount }) : t("projects.taskCount", { count: taskCount })} · ${t("projects.doneCount", { count: doneTaskCount })}`;

  const navigate = useNavigate();

  const openCreateDialog = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const retryLoad = () => {
    setLoading(true);
    void load();
  };

  return (
    <div className="relative mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-[16px] pt-[52px] pb-14 sm:px-7 sm:pt-12 sm:pb-18">
      <div className="absolute right-3 top-2 z-10 [&_button]:!size-[44px] sm:right-4 sm:top-3 sm:[&_button]:!size-8">
        <ThemeToggle />
        <LanguageToggle />
      </div>

      <header className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[32px_minmax(0,1fr)_auto]">
        <Link
          to="/"
          aria-label={t("projects.home")}
          title={t("projects.homeTitle")}
          className="col-start-1 row-start-1 inline-flex size-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:size-8"
        >
          <House size={16} aria-hidden="true" />
        </Link>
        <h1 className="col-start-2 row-start-1 text-[20px] leading-tight font-semibold tracking-tight text-foreground">{t("projects.title")}</h1>
        <p className="col-start-1 col-span-3 row-start-2 pl-[56px] text-[13px] leading-5 text-muted-foreground tabular-nums sm:col-start-2 sm:col-span-1 sm:pl-0">{summary}</p>
        {projects.length > 0 || error !== null ? (
          <div className="col-start-3 row-start-1 justify-self-end">
            <NewProjectButton onClick={openCreateDialog} />
          </div>
        ) : null}
      </header>

      <nav aria-label={t("projects.projectsView")} className="flex w-full items-center gap-1 border-b border-foreground/10">
        {(["projects", "calendar"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-current={view === option ? "page" : undefined}
            onClick={() => setView(option)}
            className={cn(
              "-mb-px min-h-[44px] border-b-2 px-4 text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              view === option
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "projects" ? t("projects.projects") : t("projects.calendar")}
          </button>
        ))}
      </nav>

      {view === "projects" ? (
        <section aria-label={t("projects.projects")} className="min-w-0">
          {loading ? (
            <ProjectListSkeleton />
          ) : error !== null ? (
            <ProjectLoadError onRetry={retryLoad} />
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-start gap-5 rounded-lg bg-card px-5 py-7 sm:px-6 sm:py-8">
              <p className="text-[14px] leading-5 text-foreground">{t("projects.createProjectEmpty")}</p>
              <NewProjectButton onClick={openCreateDialog} />
            </div>
          ) : (
            <div className="divide-y divide-border/70 border-y border-border/70">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onRename={(target) => {
                    setEditing(target);
                    setDialogOpen(true);
                  }}
                  onArchive={(target) => void handleArchive(target, true)}
                  onDelete={(target) => setDeleteTarget(target)}
                />
              ))}
            </div>
          )}

          {archived.length > 0 ? (
            <section aria-label={t("projects.archivedProjects")} className="mt-5 border-t border-border/70 pt-3">
              <Button
                type="button"
                variant="ghost"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((current) => !current)}
                className="h-8 gap-1.5 px-1 text-xs text-muted-foreground"
              >
                <ChevronRight
                  size={12}
                  aria-hidden="true"
                  className={cn("transition-transform duration-150 motion-reduce:transition-none", showArchived && "rotate-90")}
                />
                {t("projects.archivedProjects")}
                <span className="tabular-nums">{archived.length}</span>
              </Button>
              {showArchived ? (
                <ul className="mt-1 divide-y divide-border/70 border-t border-border/70">
                  {archived.map((project) => (
                    <li key={project.id} className="flex min-h-11 flex-wrap items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-muted-foreground">{project.name}</p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {project.taskCount === 1 ? t("projects.projectCountTaskOne", { tasks: project.taskCount }) : t("projects.projectCountTask", { tasks: project.taskCount })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" onClick={() => void handleArchive(project, false)} className="h-8 px-2 text-xs">
                          {t("projects.restore")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={t("projects.deleteProjectActions", { name: project.name })}
                          onClick={() => setDeleteTarget(project)}
                          className="size-8 p-0 text-muted-foreground"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </section>
      ) : (
        <section aria-label={t("projects.calendar")} className="flex flex-col gap-4">
          {error === null ? null : <ProjectLoadError onRetry={retryLoad} />}
          <div className="flex items-center gap-3">
            <h2 className="text-[14px] font-semibold text-foreground">{t("projects.everythingDue")}</h2>
            <Select
              items={filterItems}
              value={projectFilter ?? "all"}
              onValueChange={(value) => setProjectFilter(value ?? "all")}
            >
              <SelectTrigger aria-label={t("projects.project")} className="min-h-[44px] w-56 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("projects.allProjects")}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TasksCalendar projectId={projectFilter} onOpenTask={(task) => navigate(`/projects/${task.projectId}`)} />
        </section>
      )}

      <ProjectDialog
        open={dialogOpen}
        project={editing}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        onDelete={(project) => {
          setDialogOpen(false);
          setDeleteTarget(project);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("projects.deleteProjectConfirm")}
        description={
          deleteTarget === null
            ? ""
            : t("projects.deleteProjectDescription", { name: deleteTarget.name })
        }
        confirmLabel={t("projects.deleteProject")}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
      >
        {deleteTarget === null ? null : (
          <p className="text-sm text-muted-foreground">
            {deleteTarget.taskCount === 0
              ? t("projects.deleteProjectNoTasks")
              : deleteTarget.taskCount === 1 ? t("projects.deleteProjectTasksOne", { count: deleteTarget.taskCount }) : t("projects.deleteProjectTasksMany", { count: deleteTarget.taskCount })}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function NewProjectButton({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  return (
    <Button
      type="button"
      onClick={onClick}
      className="h-[44px] shrink-0 gap-2 rounded-md bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary/90 sm:h-9"
    >
      <Plus size={16} aria-hidden="true" />
      {t("projects.newProject")}
    </Button>
  );
}

function ProjectLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card px-4 py-3">
      <p role="alert" className="text-[13px] leading-5 text-foreground">{t("projects.couldNotLoad")}</p>
      <Button type="button" variant="ghost" onClick={onRetry} className="min-h-[44px] px-3 text-[13px] sm:min-h-9">
        {t("projects.retry")}
      </Button>
    </div>
  );
}

function ProjectListSkeleton() {
  const { t } = useT();
  return (
    <div role="status" aria-label={t("projects.loadingProjects")} className="overflow-hidden rounded-lg bg-card divide-y divide-foreground/10">
      {Array.from({ length: 4 }, (_, row) => (
        <div
          key={row}
          aria-hidden="true"
          className="grid grid-cols-[minmax(0,1fr)_44px] gap-x-3 gap-y-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,1.55fr)_auto_44px] sm:items-center sm:gap-x-6 sm:gap-y-0 sm:px-5 sm:py-5"
        >
          <div className="min-w-0 sm:col-start-1 sm:row-start-1">
            <span className="block h-4 w-2/3 rounded-sm bg-muted" />
            <span className="mt-2 block h-3 w-full max-w-64 rounded-sm bg-muted/70" />
          </div>
          <span className="size-11 justify-self-end rounded-md bg-muted/70 sm:col-start-4 sm:row-start-1 sm:size-9" />
          <div className="col-span-2 grid h-[76px] min-w-0 grid-flow-col auto-cols-fr gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:h-[84px]">
            {Array.from({ length: 4 }, (_, column) => (
              <div key={column} className="rounded-md bg-muted/50" />
            ))}
          </div>
          <span className="col-span-2 h-3 w-28 rounded-sm bg-muted/70 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-self-end" />
        </div>
      ))}
    </div>
  );
}
