import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "Idle" | "Unsaved" | "Saving…" | "Saved" | "Save failed";

export type SaveOptions = { keepalive?: boolean };

export interface AutosaveResult<T> {
  status: AutosaveStatus;
  hasPendingSave: boolean;
  scheduleSave: (value: T) => void;
}

type PendingSave<T> = { value: T; revision: number };
const SAVE_DELAY_MS = 700;

export function useAutosave<T>(save: (value: T, options?: SaveOptions) => Promise<void>): AutosaveResult<T> {
  const [status, setStatus] = useState<AutosaveStatus>("Idle");
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const saveRef = useRef(save);
  const pendingRef = useRef<PendingSave<T> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<(options?: SaveOptions) => Promise<void>>(async () => undefined);
  const revisionRef = useRef(0);
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);

  saveRef.current = save;

  const armTimer = useCallback((delay = SAVE_DELAY_MS) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushRef.current();
    }, delay);
  }, []);

  const flush = useCallback(async (options?: SaveOptions) => {
    if (inFlightRef.current) return;
    const pending = pendingRef.current;
    if (!pending) return;

    pendingRef.current = null;
    inFlightRef.current = true;
    if (mountedRef.current) {
      setHasPendingSave(false);
      setStatus("Saving…");
    }

    let failed = false;
    try {
      await saveRef.current(pending.value, options);
      if (mountedRef.current) {
        setStatus(pendingRef.current === null ? "Saved" : "Unsaved");
      }
    } catch {
      failed = true;
      const newerPending = pendingRef.current as PendingSave<T> | null;
      if (!newerPending || newerPending.revision < pending.revision) {
        pendingRef.current = pending;
      }
      if (mountedRef.current) setStatus("Save failed");
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setHasPendingSave(pendingRef.current !== null);

      if (pendingRef.current) {
        if (timerRef.current === null) {
          if (mountedRef.current || failed) armTimer();
          else void flushRef.current();
        }
      }
    }
  }, [armTimer]);

  flushRef.current = flush;

  const scheduleSave = useCallback(
    (value: T) => {
      pendingRef.current = { value, revision: ++revisionRef.current };
      if (mountedRef.current) {
        setHasPendingSave(true);
        if (!inFlightRef.current) {
          setStatus((currentStatus) => (currentStatus === "Save failed" ? currentStatus : "Unsaved"));
        }
      }
      armTimer();
    },
    [armTimer],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pendingRef.current) void flushRef.current();
    };
  }, []);

  // A closed tab never unmounts React: flush the pending save with a keepalive request instead of losing it.
  useEffect(() => {
    const flushBeforeClose = () => {
      if (pendingRef.current) void flushRef.current({ keepalive: true });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushBeforeClose();
    };

    window.addEventListener("pagehide", flushBeforeClose);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushBeforeClose);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, []);

  return { status, hasPendingSave, scheduleSave };
}
