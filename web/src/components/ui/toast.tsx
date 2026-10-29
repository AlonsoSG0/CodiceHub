import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export type ToastTone = "error" | "success" | "info";
export type ToastAction = { label: string; onClick: () => void };
export type ToastOptions = {
  tone: ToastTone;
  title: string;
  description?: string;
  actions?: ToastAction[];
  duration?: number;
};
type ToastFunction = (options: ToastOptions) => void;
type ToastEntry = ToastOptions & { id: number; actions: ToastAction[] };

const ToastContext = createContext<ToastFunction | null>(null);

const toneStyles: Record<ToastTone, { icon: typeof Info; className: string }> = {
  error: { icon: TriangleAlert, className: "border-destructive/30 bg-destructive/10 text-destructive" },
  success: { icon: CircleCheck, className: "border-success/30 bg-success/10 text-success" },
  info: { icon: Info, className: "border-border bg-background text-foreground" },
};

function ToastCard({ toast, dismiss }: { toast: ToastEntry; dismiss: () => void }) {
  const { t } = useT();
  const tone = toneStyles[toast.tone];
  const Icon = tone.icon;

  useEffect(() => {
    if (toast.actions.length > 0) return;
    const timer = window.setTimeout(dismiss, toast.duration ?? 5000);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.actions.length, toast.duration]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn("pointer-events-auto w-full rounded-lg border px-4 py-3 shadow-lg", tone.className)}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.description ? <p className="mt-1 text-sm text-muted-foreground">{toast.description}</p> : null}
          {toast.actions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {toast.actions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-8 px-2 text-current hover:bg-foreground/5"
                  onClick={() => {
                    action.onClick();
                    dismiss();
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={t("shell.toast.dismissNotification")}
          className="-mr-1 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={dismiss}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback<ToastFunction>((options) => {
    const actions = (options.actions ?? []).slice(0, 2);
    setToasts((current) => [...current, { ...options, id: nextId.current++, actions }]);
  }, []);

  useEffect(() => {
    const dismissLatest = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setToasts((current) => current.slice(0, -1));
    };
    document.addEventListener("keydown", dismissLatest);
    return () => document.removeEventListener("keydown", dismissLatest);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-label={t("shell.toast.notifications")}
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex max-h-screen flex-col gap-2 overflow-y-auto p-4 sm:inset-x-auto sm:bottom-0 sm:left-auto sm:right-0 sm:top-auto sm:w-full sm:max-w-sm sm:p-5"
      >
        <AnimatePresence initial={false}>
          {toasts.map((entry) => <ToastCard key={entry.id} toast={entry} dismiss={() => dismiss(entry.id)} />)}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFunction {
  const toast = useContext(ToastContext);
  if (toast === null) throw new Error("useToast must be used within ToastProvider");
  return toast;
}
