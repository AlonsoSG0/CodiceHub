import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A labelled form field.
 *
 * The label is a real `<label>` tied to the control it names, and it is set in small caps so a form reads
 * as a list of named fields rather than a wall of inputs.
 */
export function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}
