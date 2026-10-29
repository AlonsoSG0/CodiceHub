import type { CSSProperties } from "react";

/**
 * One row of the notes sidebar. The tree, the favourite shelf and the recent list all read the same, so the
 * three surfaces stay one rhythm instead of three near-copies.
 */
export const pageRowClass =
  "page-row group/page-row relative flex min-w-0 items-center gap-0.5 rounded-[6px] px-1.5 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";

export const pageRowActionClass =
  "page-row-action flex size-6 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100";

/**
 * Indentation follows the tree depth; the selection is a soft fill, the way Notion marks the row you are on.
 * The chevron slot is always reserved so icons line up in one column whether a row is expanded or not.
 */
export function pageRowStyle(depth: number, selected: boolean): CSSProperties {
  return {
    paddingInlineStart: `${6 + (depth - 1) * 16}px`,
    ...(selected ? { backgroundColor: "color-mix(in srgb, var(--sidebar-foreground) 10%, var(--sidebar))" } : null),
  };
}
