import { Check } from "lucide-react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Button } from "@/components/ui/button";
import { MenuPopup, menuItemClassName } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

/** One definition of the priority vocabulary for every module that has priorities. */
export type AppPriority = "none" | "low" | "medium" | "high" | "now";

export const priorityOrder: AppPriority[] = ["none", "low", "medium", "high", "now"];

export const priorityStyles: Record<AppPriority, { label: string; dot: string; text: string }> = {
  none: { label: "None", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  low: { label: "Low", dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-300" },
  medium: { label: "Medium", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  high: { label: "High", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  now: { label: "NOW", dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300" },
};

export function PriorityControl({
  priority,
  onChange,
  compact = false,
}: {
  priority: AppPriority;
  onChange: (priority: AppPriority) => void;
  compact?: boolean;
}) {
  const { t } = useT();
  const style = priorityStyles[priority];
  const label = t(`tasks.priority.${priority}`);
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            aria-label={t("tasks.priorityLabel", { label })}
            className={cn(
              "h-6 shrink-0 gap-1 rounded px-1 text-[10px] font-medium transition-colors duration-150 motion-reduce:transition-none",
              style.text,
              priority === "none" && "opacity-50 hover:opacity-100",
            )}
          />
        }
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            priority === "none" ? "border border-border bg-transparent" : style.dot,
          )}
          aria-hidden="true"
        />
        {compact || priority === "none" ? null : label}
      </BaseMenu.Trigger>
      <MenuPopup align="end">
        {priorityOrder.map((value) => (
          <BaseMenu.Item key={value} className={cn(menuItemClassName, "min-h-9 gap-2")} onClick={() => onChange(value)}>
            <span className={cn("size-2 rounded-full", priorityStyles[value].dot)} aria-hidden="true" />
            <span className={cn("text-xs", priorityStyles[value].text)}>{t(`tasks.priority.${value}`)}</span>
            {priority === value ? <Check size={13} className="ml-auto" aria-hidden="true" /> : null}
          </BaseMenu.Item>
        ))}
      </MenuPopup>
    </BaseMenu.Root>
  );
}
