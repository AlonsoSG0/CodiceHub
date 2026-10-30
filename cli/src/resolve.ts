import { OpsError } from "./ops.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the argument is already an id, so it must be used as one and never matched against titles. */
export function looksLikeId(value: string): boolean {
  return uuidPattern.test(value.trim());
}

/**
 * Resolve an argument to one row. An id-shaped argument is an id; anything else is a human title, matched exactly
 * first and by unique substring after that. Ambiguity is an error listing the candidates, never a guess: titles are
 * not unique in any module of this workspace.
 */
export function resolveNamed<T extends { id: string }>(
  rows: T[],
  argument: string,
  label: (row: T) => string,
  what: string,
): T {
  const needle = argument.trim();
  if (looksLikeId(needle)) {
    const byId = rows.find((row) => row.id === needle);
    if (byId === undefined) throw new OpsError("not_found", `no ${what} with id ${needle}`);
    return byId;
  }

  const lowered = needle.toLowerCase();
  const exact = rows.filter((row) => label(row).trim().toLowerCase() === lowered);
  const candidates = exact.length > 0 ? exact : rows.filter((row) => label(row).toLowerCase().includes(lowered));
  const [only, ...rest] = candidates;
  if (only === undefined) throw new OpsError("not_found", `no ${what} matches "${argument}"`);
  if (rest.length > 0) {
    throw new OpsError("ambiguous", `"${argument}" is ambiguous: ${candidates.map(label).join(", ")}`);
  }
  return only;
}
