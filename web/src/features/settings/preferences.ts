import { useSyncExternalStore } from "react"
import { sections } from "@/app/sections"
import { fetchPreferences, savePreference } from "@/lib/api"
import { DEFAULT_TIMEZONE, isTimeZone } from "@/lib/timezone"

export type ModulePreference = { order: string[]; hidden: string[] }
export type PreferenceValue = string | boolean | string[] | ModulePreference | undefined

export type PreferenceKey =
  | "appearance.theme"
  | "appearance.density"
  | "appearance.motion"
  | "appearance.language"
  | "nav.dockPinned"
  | "nav.modules"
  | "notes.recent"
  | "modules.retention"
  | "modules.retentionScope"
  | "modules.readingHabit"
  | "modules.readingHabitLinked"
  | "workspace.timezone"

type PreferenceEntry<T> = {
  key: PreferenceKey
  group: "Appearance" | "Navigation" | "Notes" | "Modules" | "Workspace"
  scope: "device" | "workspace"
  kind: "toggle" | "select" | "modules" | "options" | "timezone"
  label: string
  description: string
  default: T
  options?: readonly T[]
  validate: (value: unknown) => value is T
}

const oneOf = <T extends string>(...values: T[]) => (value: unknown): value is T =>
  typeof value === "string" && values.includes(value as T)
const bool = (value: unknown): value is boolean => typeof value === "boolean"
const moduleIds = sections.map(({ id }) => id)
const validModuleIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === "string" && moduleIds.includes(id)) &&
  new Set(value).size === value.length
const validModules = (value: unknown): value is ModulePreference =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  "order" in value && "hidden" in value &&
  validModuleIds(value.order) && validModuleIds(value.hidden)
const defaultModules: ModulePreference = { order: moduleIds, hidden: [] }

const retentionValues = ["never", "7", "15", "30"] as const

export const preferences: readonly PreferenceEntry<unknown>[] = [
  { key: "appearance.theme", group: "Appearance", scope: "device", kind: "select", label: "Theme", description: "Choose the color theme.", default: "system", options: ["light", "dark", "atripp", "system"], validate: oneOf("light", "dark", "atripp", "system") },
  { key: "appearance.density", group: "Appearance", scope: "device", kind: "select", label: "Density", description: "Choose the interface density.", default: "compact", options: ["compact", "comfortable"], validate: oneOf("compact", "comfortable") },
  { key: "appearance.motion", group: "Appearance", scope: "device", kind: "select", label: "Motion", description: "Choose the motion preference.", default: "system", options: ["system", "reduced"], validate: oneOf("system", "reduced") },
  { key: "appearance.language", group: "Appearance", scope: "device", kind: "select", label: "Language", description: "Choose the interface language.", default: "en", options: ["en", "es"], validate: oneOf("en", "es") },
  { key: "nav.dockPinned", group: "Navigation", scope: "device", kind: "toggle", label: "Pin navigation", description: "Keep navigation visible.", default: false, validate: bool },
  { key: "nav.modules", group: "Navigation", scope: "device", kind: "modules", label: "Navigation modules", description: "Choose visible navigation modules and their order.", default: defaultModules, validate: validModules },
  { key: "notes.recent", group: "Notes", scope: "device", kind: "toggle", label: "Recent notes", description: "Show recently opened notes.", default: true, validate: bool },
  { key: "modules.retention", group: "Modules", scope: "workspace", kind: "options", label: "Task retention", description: "Choose when completed task checks are removed.", default: "never", options: retentionValues, validate: oneOf(...retentionValues) },
  { key: "modules.retentionScope", group: "Modules", scope: "workspace", kind: "select", label: "Retention scope", description: "Choose which checks the retention window removes.", default: "completed", options: ["completed", "all"], validate: oneOf("completed", "all") },
  { key: "modules.readingHabit", group: "Modules", scope: "workspace", kind: "select", label: "Reading habit", description: "Choose the habit tracked by Books.", default: "Reading", validate: (value): value is string => typeof value === "string" && value.trim().length > 0 },
  { key: "modules.readingHabitLinked", group: "Modules", scope: "workspace", kind: "toggle", label: "Reading habit in Habits", description: "Show the reading habit Books records inside Habits.", default: true, validate: bool },
  { key: "workspace.timezone", group: "Workspace", scope: "workspace", kind: "timezone", label: "Time zone", description: "Every date in this workspace — today, and which days are still editable — is calculated in this zone.", default: DEFAULT_TIMEZONE, validate: isTimeZone },
]

const byKey = new Map(preferences.map((entry) => [entry.key, entry]))
export function preference(key: string): PreferenceEntry<unknown> | undefined { return byKey.get(key as PreferenceKey) }
export function defaultOf(key: string): PreferenceValue { return preference(key)?.default as PreferenceValue }
export function validatePreference(key: string, value: unknown): boolean {
  const entry = preference(key)
  return !!entry && entry.validate(value)
}

const STORAGE_KEY = "chub.settings"
type Values = Record<string, unknown>
const listeners = new Set<() => void>()
const snapshots = new Map<string, unknown>()
let deviceValues: Values | null = null
let workspaceLoaded = false
let workspaceStatus: "pending" | "ready" | "failed" = "pending"
let workspaceSettled: (() => void) | null = null
let workspaceLoad: Promise<void> | null = null
const workspaceValues = new Map<string, unknown>()

function normalize(key: string, value: unknown): PreferenceValue {
  const entry = preference(key)
  if (key === "nav.modules" && Array.isArray(value)) {
    // The old array cannot distinguish hidden sections from sections added later, so previously hidden sections appear once and must be hidden again.
    value = { order: value, hidden: [] }
  }
  return entry?.validate(value) ? value as PreferenceValue : entry?.default as PreferenceValue
}
function notify(key?: string) {
  if (key) snapshots.delete(key)
  else snapshots.clear()
  listeners.forEach((listener) => listener())
}
function adoptLegacy(): Values {
  const adopted: Values = {}
  try {
    const theme = window.localStorage.getItem("chub-theme")
    if (theme !== null) adopted["appearance.theme"] = normalize("appearance.theme", theme)
    const legacyRetention = window.localStorage.getItem("chub.tasks.retention")
    if (legacyRetention !== null) {
      try {
        const old: unknown = JSON.parse(legacyRetention)
        if (old && typeof old === "object" && "days" in old) {
          const days = (old as { days: unknown }).days
          // Both dimensions are adopted; dropping the scope would silently narrow what the user chose.
          adopted["modules.retention"] = normalize("modules.retention", days === null ? "never" : String(days))
          adopted["modules.retentionScope"] = normalize("modules.retentionScope", (old as { scope?: unknown }).scope)
        } else {
          adopted["modules.retention"] = defaultOf("modules.retention")
          adopted["modules.retentionScope"] = defaultOf("modules.retentionScope")
        }
      } catch {
        adopted["modules.retention"] = defaultOf("modules.retention")
        adopted["modules.retentionScope"] = defaultOf("modules.retentionScope")
      }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(adopted))
  } catch { /* Storage unavailable: the adopted values live in this session's memory only. */ }
  // Workspace-scoped entries stay in the device object as an offline mirror, but reads go through the
  // workspace map, so every adopted workspace key has to be mirrored or the adoption silently disappears.
  for (const [key, value] of Object.entries(adopted)) {
    if (preference(key)?.scope === "workspace") workspaceValues.set(key, value)
  }
  return adopted
}

function readDevice(): Values {
  if (deviceValues) return deviceValues
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) deviceValues = parsed as Values
    }
  } catch { /* A corrupt namespaced object is treated as absent, so the legacy keys are still adopted. */ }
  if (!deviceValues) deviceValues = adoptLegacy()
  return deviceValues
}
function readValue(key: string): PreferenceValue {
  const entry = preference(key)
  if (!entry) return undefined
  if (entry.scope === "device") {
    const values = readDevice()
    const stored = values[key] ?? entry.default
    const normalized = normalize(key, stored)
    if (key === "nav.modules" && Array.isArray(stored)) {
      values[key] = normalized
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values)) } catch { /* Keep the migrated value in this session. */ }
    }
    return normalized
  }
  if (!workspaceLoaded) void loadWorkspaceOnce()
  if (workspaceValues.has(key)) return workspaceValues.get(key) as PreferenceValue
  // The device object is the offline mirror: after a reload the adoption does not run again, so without this
  // fallback a workspace preference would read as its default until the server answered — or forever, offline.
  const mirrored = readDevice()[key]
  if (mirrored !== undefined) {
    const value = normalize(key, mirrored)
    workspaceValues.set(key, value)
    return value
  }
  return entry.default as PreferenceValue
}

/**
 * Loads the workspace-scoped values once. Consumers that would *write* data based on a workspace preference
 * (Books creating its reading habit) must await this first: reading the registry default while the fetch is in
 * flight is how a guessed name becomes a second habit in SQLite.
 */
function loadWorkspaceOnce(): Promise<void> {
  if (workspaceLoad) return workspaceLoad
  workspaceLoaded = true
  workspaceLoad = new Promise<void>((resolve) => {
    workspaceSettled = resolve
  })
  void fetchPreferences()
    .then((values) => {
      for (const entry of preferences) {
        if (entry.scope !== "workspace") continue
        if (entry.key in values) {
          workspaceValues.set(entry.key, normalize(entry.key, values[entry.key]))
          continue
        }
        // The server has no value for a workspace key the mirror knows: upload it once, or a cleared browser
        // would silently reset the choice the legacy adoption just recovered.
        const mirrored = readDevice()[entry.key]
        if (mirrored === undefined) continue
        const value = normalize(entry.key, mirrored)
        workspaceValues.set(entry.key, value)
        void savePreference(entry.key, value).catch(() => undefined)
      }
      workspaceStatus = "ready"
    })
    .catch(() => {
      workspaceStatus = "failed"
    })
    .finally(() => {
      workspaceSettled?.()
      notify()
    })
  return workspaceLoad
}

/** Resolves once the workspace values were read, whether they loaded or the request failed. */
export function whenWorkspacePreferencesLoaded(): Promise<void> {
  return loadWorkspaceOnce()
}

/** `failed` means the values in the store are defaults, not what the user chose. */
export function workspacePreferencesStatus(): "pending" | "ready" | "failed" {
  return workspaceStatus
}

/** Read one value outside React, after awaiting `whenWorkspacePreferencesLoaded`. */
export function currentValue(key: string): PreferenceValue {
  return readValue(key)
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage)
  return () => { listeners.delete(listener); if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage) }
}
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return
  try { deviceValues = event.newValue ? JSON.parse(event.newValue) as Values : {} } catch { deviceValues = {} }
  notify()
}
export function setPreference(key: string, value: unknown): void {
  const entry = preference(key)
  if (!entry || !entry.validate(value)) return
  if (entry.scope === "device") {
    const values = readDevice()
    values[key] = value
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values)) } catch { /* Keep the optimistic session value. */ }
  } else {
    workspaceValues.set(key, value)
    void savePreference(key, value).catch(() => undefined)
  }
  notify()
}
/**
 * Drops the module-level cache. Tests call it so a previous case cannot leak a device value into the next one,
 * which would make an "applies a stored theme on mount" case pass for the wrong reason. It is also the honest
 * recovery path when the underlying storage was replaced out of band and no `storage` event was delivered.
 */
export function resetPreferenceCache(): void {
  deviceValues = null
  workspaceLoaded = false
  workspaceStatus = "pending"
  workspaceSettled = null
  workspaceLoad = null
  workspaceValues.clear()
  notify()
}

export function usePreference(key: string): [unknown, (value: unknown) => void] {
  const value = useSyncExternalStore(subscribe, () => {
    if (snapshots.has(key)) return snapshots.get(key)
    const current = readValue(key)
    snapshots.set(key, current)
    return current
  }, () => defaultOf(key))
  return [value, (next) => setPreference(key, next)]
}
