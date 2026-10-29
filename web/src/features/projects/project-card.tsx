import { Link } from "react-router-dom";
import { Archive, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Button } from "@/components/ui/button";
import { MenuPopup, menuItemClassName } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import type { ProjectSummary } from "./projects-api";
import { ProjectPreview } from "./project-preview";
import { useT } from "@/i18n";

type ProjectCardProps = {
  project: ProjectSummary;
  onRename: (project: ProjectSummary) => void;
  onArchive: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
};

/** One project row, with its board shape beside the work's name and counts. */
export function ProjectCard({ project, onRename, onArchive, onDelete }: ProjectCardProps) {
  const { t } = useT();
  return (
    <article className="group/project relative grid grid-cols-[minmax(0,1fr)_44px] gap-x-3 gap-y-3 px-[16px] py-4 transition-colors duration-150 hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,1.55fr)_auto_44px] sm:items-center sm:gap-x-6 sm:gap-y-0 sm:px-5 sm:py-5">
      <div className="min-w-0 sm:col-start-1 sm:row-start-1">
        <h2 className="text-[14px] leading-5 font-semibold text-foreground">
          <Link
            to={`/projects/${project.id}`}
            className="after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring/70"
          >
            {project.name}
          </Link>
        </h2>

        {project.description === null || project.description.trim() === "" ? null : (
          <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">{project.description}</p>
        )}
      </div>

      <ProjectPreview columns={project.columns} className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1" />

      <p
        aria-label={project.taskCount === 1 ? t("projects.taskCountOneDone", { tasks: project.taskCount, done: project.doneTaskCount }) : t("projects.taskCountDone", { tasks: project.taskCount, done: project.doneTaskCount })}
        className="col-span-2 flex items-baseline gap-1.5 whitespace-nowrap text-[12px] text-muted-foreground tabular-nums sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-self-end"
      >
        <span className="font-medium text-foreground">{project.taskCount}</span>
        <span>{project.taskCount === 1 ? t("projects.taskOne") : t("projects.tasksMany")}</span>
        <span aria-hidden="true">·</span>
        <span className="font-medium text-foreground">{project.doneTaskCount}</span>
        <span>{t("projects.done")}</span>
      </p>

      <div className="col-start-2 row-start-1 justify-self-end sm:col-start-4 sm:row-start-1">
        <BaseMenu.Root>
          <BaseMenu.Trigger
            render={
              <Button
                type="button"
                variant="ghost"
                aria-label={t("projects.actions", { name: project.name })}
                className="relative z-10 size-[44px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60 sm:size-9"
              />
            }
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </BaseMenu.Trigger>
          <MenuPopup align="end">
            <BaseMenu.Item className={menuItemClassName} onClick={() => onRename(project)}>
              <Pencil size={14} aria-hidden="true" />
              {t("projects.rename")}
            </BaseMenu.Item>
            <BaseMenu.Item className={menuItemClassName} onClick={() => onArchive(project)}>
              <Archive size={14} aria-hidden="true" />
              {t("projects.archive")}
            </BaseMenu.Item>
            <BaseMenu.Item
              className={cn(menuItemClassName, "text-destructive")}
              onClick={() => onDelete(project)}
            >
              <Trash2 size={14} aria-hidden="true" />
              {t("projects.delete")}
            </BaseMenu.Item>
          </MenuPopup>
        </BaseMenu.Root>
      </div>
    </article>
  );
}
