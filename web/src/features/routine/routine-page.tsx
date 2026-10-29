/*
 * PROTOTYPE — the Routine section shell: header, mode switch and the three surfaces. The data is mocked (S1), so the
 * page carries one visible line saying so and one action that wipes it back to the seed (S11).
 */

import { useEffect, useState } from "react";
import { House } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import type { DayKey } from "@/features/habits/date";
import { usePreference } from "@/features/settings/preferences";
import { DEFAULT_TIMEZONE, isTimeZone, todayInZone } from "@/lib/timezone";
import { RoutineBuilder } from "@/features/routine/routine-builder";
import { RoutineToday } from "@/features/routine/routine-today";
import { RoutineWeek } from "@/features/routine/routine-week";
import { useRoutineStore } from "./use-routine";
import { useT } from "@/i18n";

export type RoutineMode = "today" | "week" | "build";

export function RoutinePage() {
  const { t } = useT();
  const [storedTimezone] = usePreference("workspace.timezone");
  const timezone = isTimeZone(storedTimezone) ? storedTimezone : DEFAULT_TIMEZONE;
  const today: DayKey = todayInZone(timezone);
  // Null means the user is still following today; an explicit date means they navigated away.
  const [browsedDate, setBrowsedDate] = useState<DayKey | null>(null);
  const date = browsedDate ?? today;
  const setDate = (next: DayKey) => setBrowsedDate(next === today ? null : next);
  const [now] = useState(() => new Date());
  const [mode, setMode] = useState<RoutineMode>("today");
  const store = useRoutineStore();
  const toast = useToast();

  useEffect(() => {
    if (store.error === null) return;
    toast({
      tone: "error",
      title: t("routine.updateFailed"),
      description: store.error,
      actions: [
        {
          label: t("routine.retry"),
          onClick: () => {
            store.clearError();
            void store.reset();
          },
        },
        { label: t("routine.dismiss"), onClick: store.clearError },
      ],
    });
  }, [store.clearError, store.error, store.reset, toast]);

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 sm:gap-7 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            aria-label={t("routine.goHome")}
            title={t("routine.home")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <House className="size-4" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("routine.title")}</h1>
            <p className="text-[13px] text-muted-foreground">
              {t("routine.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label={t("routine.view")} className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-muted/40 p-0.5">
            {(["today", "week", "build"] as const).map((id) => (
              <Button
                key={id}
                type="button"
                role="tab"
                id={`routine-tab-${id}`}
                aria-controls={`routine-panel-${id}`}
                aria-selected={mode === id}
                variant={mode === id ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setMode(id)}
              >
                {t(`routine.${id}`)}
              </Button>
            ))}
          </div>
          <div className="[&>button]:size-9">
            <LanguageToggle />
          </div>
          <div className="[&>button]:size-9">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {store.loading || store.state === null ? <LoadingSkeleton label={t("routine.loading")} className="min-h-40" /> : null}

      {store.state === null ? null : (
        <div role="tabpanel" id={`routine-panel-${mode}`} aria-labelledby={`routine-tab-${mode}`}>
          {mode === "today" ? <RoutineToday store={store} today={today} date={date} now={now} onDateChange={setDate} /> : null}
          {mode === "week" ? <RoutineWeek store={store} today={today} /> : null}
          {mode === "build" ? <RoutineBuilder store={store} /> : null}
        </div>
      )}
    </main>
  );
}
