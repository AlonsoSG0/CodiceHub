import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { SummaryColumn } from "./projects-api";
import { useT } from "@/i18n";

/**
 * A project row carries a miniature of its own board.
 *
 * Every column keeps its place and equal lane width, with its real name and task count in the header. Task
 * cards appear as small surfaces, and the completion column gets an explicit check mark and stronger tone
 * so the board's state reads as a miniature rather than a collection of bars.
 */

/** Cap the preview cards while preserving the real count in each column header. */
const MAX_PREVIEW_CARDS = 2;

export function ProjectPreview({
  columns,
  className,
}: {
  columns: SummaryColumn[];
  className?: string;
}) {
  const { t } = useT();
  if (columns.length === 0) {
    return (
      <div
        aria-hidden="true"
        className={cn("flex h-[82px] min-w-0 items-center justify-center rounded-md bg-muted/30 text-[11px] text-muted-foreground", className)}
      >
        {t("projects.noColumns")}
      </div>
    );
  }

  return (
    <div aria-hidden="true" className={cn("grid h-[82px] min-w-0 grid-flow-col auto-cols-fr gap-1.5", className)}>
      {columns.map((column) => (
        <div
          key={column.id}
          title={`${column.name}: ${column.taskCount} ${column.taskCount === 1 ? t("projects.taskOne") : t("projects.tasksMany")}${column.isCompleted ? `, ${t("projects.completed")}` : ""}`}
          className={cn(
            "flex min-w-0 flex-col gap-1 rounded-[6px] border px-1.5 py-1",
            column.isCompleted ? "bg-muted/80" : "bg-muted/30",
          )}
        >
          <div className="flex min-w-0 items-center gap-1">
            {column.isCompleted ? <Check size={11} className="shrink-0 text-foreground" aria-hidden="true" /> : null}
            <span className="hidden min-w-0 flex-1 truncate text-[11px] leading-4 font-medium text-foreground lg:inline">{column.name}</span>
            <span className="shrink-0 text-[11px] leading-4 tabular-nums text-muted-foreground">{column.taskCount}</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
            {column.taskCount === 0 ? (
              <div className="min-h-0 flex-1 rounded-[4px] bg-background/40" />
            ) : (
              Array.from({ length: Math.min(column.taskCount, MAX_PREVIEW_CARDS) }, (_, index) => (
                <div
                  key={index}
                  className="flex h-[24px] shrink-0 flex-col justify-center gap-[3px] rounded-[4px] bg-foreground/10 px-1.5"
                >
                  <span className="h-[3px] w-3/4 rounded-full bg-foreground/45" />
                  <span className="h-[3px] w-1/2 rounded-full bg-foreground/25" />
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
