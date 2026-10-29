const COLLAPSED_STORAGE_KEY = "chub-notes-collapsed-sections";

/** Collapsed shelves survive a reload, the same way expanded pages do. */
export function readCollapsedShelves(): Set<string> {
  try {
    const raw = window.localStorage?.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

export function writeCollapsedShelves(keys: Set<string>): void {
  try {
    window.localStorage?.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // A sidebar that cannot remember is still a working sidebar.
  }
}

/** The default `Pages` shelf is keyed `default` because it has no section row. */
export const DEFAULT_SHELF_KEY = "default";

export function shelfKey(sectionId: string | null): string {
  return sectionId ?? DEFAULT_SHELF_KEY;
}
