import type { DayKey } from "@/features/habits/date";
import type {
  BlockInput,
  BlockPatch,
  BlockStatus,
  LinkedMirror,
  LinkTargets,
  RoutineBlock,
  RoutineDay,
  RoutineOccurrence,
  RoutineSettings,
  RoutineState,
  Weekday,
} from "./types";

export type RoutineSnapshot = { state: RoutineState; mirrors: LinkedMirror[] };
export type OccurrencePatch = { status?: BlockStatus; note?: string };

type SnapshotPayload = {
  settings: Omit<RoutineSettings, "dayWindows"> & {
    dayWindows?: RoutineSettings["dayWindows"] | Array<{ weekday: Weekday; start: string; end: string }>;
  };
  days: Array<Partial<RoutineDay> & { weekday: Weekday }>;
  blocks: Array<RoutineBlock & { weekday?: Weekday }>;
  occurrences: RoutineOccurrence[];
  mirrors: LinkedMirror[];
};

export class RoutineApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(`${code}: ${message}`);
    this.name = "RoutineApiError";
  }
}

function decodeSnapshot(payload: SnapshotPayload): RoutineSnapshot {
  const daysByWeekday = new Map<Weekday, RoutineDay>();
  for (const day of payload.days) {
    daysByWeekday.set(day.weekday, {
      weekday: day.weekday,
      blocks: day.blocks ?? [],
      isTemplate: day.isTemplate ?? false,
    });
  }
  for (const block of payload.blocks) {
    if (block.weekday === undefined) continue;
    const day = daysByWeekday.get(block.weekday) ?? { weekday: block.weekday, blocks: [], isTemplate: false };
    day.blocks.push(block);
    daysByWeekday.set(block.weekday, day);
  }
  const rawWindows = payload.settings.dayWindows ?? {};
  const dayWindows = Array.isArray(rawWindows)
    ? Object.fromEntries(rawWindows.map(({ weekday, start, end }) => [weekday, { start, end }]))
    : rawWindows;

  return {
    state: {
      settings: { ...payload.settings, dayWindows },
      days: [...daysByWeekday.values()].sort((left, right) => left.weekday - right.weekday),
      occurrences: payload.occurrences,
    },
    mirrors: payload.mirrors,
  };
}

async function requestSnapshot(path: string, init?: RequestInit): Promise<RoutineSnapshot> {
  const response = await fetch(path, init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    const code = typeof body.error === "string" ? body.error : typeof body.code === "string" ? body.code : `http_${response.status}`;
    const message = typeof body.message === "string" ? body.message : code;
    throw new RoutineApiError(code, message, response.status);
  }
  return decodeSnapshot(payload as SnapshotPayload);
}

function jsonInit(method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function blockPath(id: string): string {
  return `/api/routine/blocks/${encodeURIComponent(id)}`;
}

export function loadRoutine(): Promise<RoutineSnapshot> {
  return requestSnapshot("/api/routine");
}

export async function fetchLinkTargets(): Promise<LinkTargets> {
  const response = await fetch("/api/routine/link-targets");
  const payload: unknown = await response.json();
  if (!response.ok) {
    const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    const code = typeof body.error === "string" ? body.error : typeof body.code === "string" ? body.code : `http_${response.status}`;
    const message = typeof body.message === "string" ? body.message : code;
    throw new RoutineApiError(code, message, response.status);
  }
  return payload as LinkTargets;
}

export function saveSettings(patch: Partial<RoutineSettings>): Promise<RoutineSnapshot> {
  const body: Record<string, unknown> = { ...patch };
  if (patch.dayWindows !== undefined) {
    body.dayWindows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      const window = patch.dayWindows?.[weekday as Weekday];
      return window === undefined ? { weekday, start: null } : { weekday, ...window };
    });
  }
  return requestSnapshot("/api/routine/settings", jsonInit("PUT", body));
}

export function createBlock(weekday: Weekday, input: BlockInput): Promise<RoutineSnapshot> {
  return requestSnapshot(`/api/routine/days/${weekday}/blocks`, jsonInit("POST", input));
}

export function updateBlock(blockId: string, patch: BlockPatch): Promise<RoutineSnapshot> {
  return requestSnapshot(blockPath(blockId), jsonInit("PATCH", patch));
}

export function deleteBlock(blockId: string): Promise<RoutineSnapshot> {
  return requestSnapshot(blockPath(blockId), { method: "DELETE" });
}

export function repeatDay(weekday: Weekday): Promise<RoutineSnapshot> {
  return requestSnapshot(`/api/routine/days/${weekday}/repeat`, jsonInit("POST", {}));
}

export function clearDay(weekday: Weekday): Promise<RoutineSnapshot> {
  return requestSnapshot(`/api/routine/days/${weekday}`, { method: "DELETE" });
}

export function setOccurrence(blockId: string, date: DayKey, patch: OccurrencePatch): Promise<RoutineSnapshot> {
  return requestSnapshot(`${blockPath(blockId)}/occurrences/${encodeURIComponent(date)}`, jsonInit("PUT", patch));
}
