import { preference } from "@/features/settings/preferences";

export type RetentionScope = "completed" | "all";

export type RetentionPolicy = { days: number | null; scope: RetentionScope };

/** Never by default: deleting a person's checks is opt-in, never a surprise on first load. */
export const defaultRetention: RetentionPolicy = { days: null, scope: "completed" };

const retentionOptions = preference("modules.retention")?.options ?? [];
export const retentionChoices: Array<{ days: number | null; label: string }> = retentionOptions.map((option) => {
  const days = option === "never" ? null : Number(option);
  return { days, label: days === null ? "Never" : `${days} days` };
});

/** Compose the cleanup policy from the workspace preference values. Invalid windows always disable deletion. */
export function readRetention(window: unknown = "never", scope: unknown = "completed"): RetentionPolicy {
  const days = window === "7" ? 7 : window === "15" ? 15 : window === "30" ? 30 : null;
  return { days, scope: scope === "all" ? "all" : "completed" };
}

export function writeRetention(
  policy: RetentionPolicy,
  setWindow?: (value: unknown) => void,
  setScope?: (value: unknown) => void,
): void {
  setWindow?.(policy.days === null ? "never" : String(policy.days));
  setScope?.(policy.scope);
}
