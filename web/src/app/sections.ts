import type { LucideIcon } from "lucide-react"
import { BookOpen, Flame, Library, ListChecks, SquareKanban, Target, Sunrise } from "lucide-react"

export type SectionEntry = {
  id: string
  label: string
  href: `/${string}`
  icon: LucideIcon
  shortcut: string
}

/** Canonical section order; consumers may reorder or hide these ids without changing routes. */
export const sections: readonly SectionEntry[] = [
  { id: "notes", label: "Notes", href: "/notes", icon: BookOpen, shortcut: "N" },
  { id: "habits", label: "Habits", href: "/habits", icon: Flame, shortcut: "H" },
  { id: "routine", label: "Routine", href: "/routine", icon: Sunrise, shortcut: "R" },
  { id: "books", label: "Books", href: "/books", icon: Library, shortcut: "B" },
  { id: "projects", label: "Projects", href: "/projects", icon: SquareKanban, shortcut: "P" },
  { id: "tasks", label: "Tasks", href: "/tasks", icon: ListChecks, shortcut: "T" },
  { id: "goals", label: "Goals", href: "/goals", icon: Target, shortcut: "G" },
]

/** Keep known ids in the supplied order, then append newly registered sections canonically. */
export function canonicalSectionOrder(ids: readonly string[] = []): string[] {
  const known = new Set(sections.map(({ id }) => id))
  const ordered = ids.filter((id, index) => known.has(id) && ids.indexOf(id) === index)
  const included = new Set(ordered)
  return [...ordered, ...sections.map(({ id }) => id).filter((id) => !included.has(id))]
}
