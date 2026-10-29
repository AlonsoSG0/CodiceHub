/* The one hook every routine surface talks to; it keeps the store interface stable across the HTTP boundary. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DayKey } from "@/features/habits/date";
import {
  clearDay,
  createBlock,
  deleteBlock,
  loadRoutine,
  repeatDay,
  saveSettings,
  setOccurrence,
  updateBlock,
  type RoutineSnapshot,
} from "./routine-api";
import type {
  BlockInput,
  BlockPatch,
  BlockStatus,
  LinkedMirror,
  RoutineSettings,
  RoutineState,
  Weekday,
} from "./types";

export type OccurrencePatch = { status?: BlockStatus; note?: string };

export type RoutineStore = {
  state: RoutineState | null;
  mirrors: LinkedMirror[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
  saveSettings: (patch: Partial<RoutineSettings>) => Promise<void>;
  createBlock: (weekday: Weekday, input: BlockInput) => Promise<void>;
  updateBlock: (blockId: string, patch: BlockPatch) => Promise<void>;
  deleteBlock: (blockId: string) => Promise<void>;
  repeatDay: (weekday: Weekday) => Promise<void>;
  clearDay: (weekday: Weekday) => Promise<void>;
  setOccurrence: (blockId: string, date: DayKey, patch: OccurrencePatch) => Promise<void>;
  reset: () => Promise<void>;
};

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : "unknown_error";
}

export function useRoutineStore(): RoutineStore {
  const [snapshot, setSnapshot] = useState<RoutineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const apply = useCallback((next: RoutineSnapshot) => {
    setSnapshot(next);
    setError(null);
  }, []);

  const run = useCallback(
    async (action: () => Promise<RoutineSnapshot>) => {
      try {
        const next = await action();
        if (alive.current) apply(next);
      } catch (failure) {
        if (alive.current) setError(messageOf(failure));
      }
    },
    [apply],
  );

  useEffect(() => {
    alive.current = true;
    loadRoutine()
      .then((initial) => {
        if (!alive.current) return;
        setSnapshot(initial);
        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (!alive.current) return;
        setError(messageOf(failure));
        setLoading(false);
      });

    return () => {
      alive.current = false;
    };
  }, []);

  return {
    state: snapshot?.state ?? null,
    mirrors: snapshot?.mirrors ?? [],
    loading,
    error,
    clearError: useCallback(() => setError(null), []),
    saveSettings: useCallback((patch) => run(() => saveSettings(patch)), [run]),
    createBlock: useCallback((weekday, input) => run(() => createBlock(weekday, input)), [run]),
    updateBlock: useCallback((blockId, patch) => run(() => updateBlock(blockId, patch)), [run]),
    deleteBlock: useCallback((blockId) => run(() => deleteBlock(blockId)), [run]),
    repeatDay: useCallback((weekday) => run(() => repeatDay(weekday)), [run]),
    clearDay: useCallback((weekday) => run(() => clearDay(weekday)), [run]),
    setOccurrence: useCallback((blockId, date, patch) => run(() => setOccurrence(blockId, date, patch)), [run]),
    reset: useCallback(() => run(() => loadRoutine()), [run]),
  };
}
