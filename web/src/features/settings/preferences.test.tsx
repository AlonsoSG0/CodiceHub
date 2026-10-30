import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ fetchPreferences: vi.fn(), savePreference: vi.fn() }))
vi.mock("@/lib/api", () => api)

async function loadStore() {
  vi.resetModules()
  return import("./preferences")
}

let storage: Map<string, string>
let testStorage: Storage
beforeEach(() => {
  storage = new Map()
  testStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: (key) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: (index) => [...storage.keys()][index] ?? null,
    get length() { return storage.size },
  } as Storage
  Object.defineProperty(window, "localStorage", { configurable: true, value: testStorage })
  api.fetchPreferences.mockReset().mockResolvedValue({})
  api.savePreference.mockReset().mockResolvedValue({})
})

describe("settings preferences", () => {
  it("provides registry defaults and validates values", async () => {
    const store = await loadStore()
    expect(store.preferences.map(({ key }) => key)).toEqual([
      "appearance.theme", "appearance.density", "appearance.motion", "appearance.language", "nav.dockPinned", "nav.modules",
      "notes.recent", "modules.retention", "modules.retentionScope", "modules.readingHabit", "modules.readingHabitLinked", "workspace.timezone",
    ])
    expect(store.preference("appearance.theme")?.options).toEqual(["light", "dark", "atripp", "system"])
    expect(store.validatePreference("appearance.theme", "atripp")).toBe(true)
    expect(store.defaultOf("appearance.theme")).toBe("atripp")
    expect(store.defaultOf("appearance.density")).toBe("compact")
    expect(store.defaultOf("appearance.motion")).toBe("system")
    expect(store.defaultOf("nav.dockPinned")).toBe(false)
    expect(store.defaultOf("nav.modules")).toEqual({ order: ["notes", "habits", "routine", "books", "projects", "tasks", "goals"], hidden: [] })
    expect(store.defaultOf("notes.recent")).toBe(true)
    expect(store.defaultOf("modules.retention")).toBe("never")
    expect(store.defaultOf("modules.retentionScope")).toBe("completed")
    expect(store.defaultOf("modules.readingHabit")).toBe("Reading")
    expect(store.defaultOf("workspace.timezone")).toBe("America/Mexico_City")
    expect(store.validatePreference("workspace.timezone", "Europe/Madrid")).toBe(true)
    expect(store.validatePreference("workspace.timezone", "Mars/Olympus")).toBe(false)
    expect(store.validatePreference("appearance.theme", "dark")).toBe(true)
    expect(store.validatePreference("appearance.theme", "sepia")).toBe(false)
    expect(store.validatePreference("nav.modules", { order: ["notes", "notes"], hidden: [] })).toBe(false)
    expect(store.validatePreference("nav.modules", { order: ["notes", "unknown"], hidden: [] })).toBe(false)
    expect(store.validatePreference("nav.modules", { order: ["notes"], hidden: ["notes", "notes"] })).toBe(false)
    expect(store.validatePreference("nav.modules", { order: ["notes"], hidden: ["unknown"] })).toBe(false)
    expect(store.defaultOf("unknown")).toBeUndefined()
  })

  it("migrates legacy navigation arrays to ordered modules with none hidden", async () => {
    window.localStorage.setItem("chub.settings", JSON.stringify({ "nav.modules": ["goals", "notes"] }))
    const store = await loadStore()

    expect(renderHook(() => store.usePreference("nav.modules")).result.current[0]).toEqual({
      order: ["goals", "notes"],
      hidden: [],
    })
    expect(JSON.parse(window.localStorage.getItem("chub.settings")!)["nav.modules"]).toEqual({
      order: ["goals", "notes"],
      hidden: [],
    })
  })

  it("round-trips device preferences in the single settings object", async () => {
    const store = await loadStore()
    const { result } = renderHook(() => store.usePreference("appearance.theme"))
    act(() => result.current[1]("dark"))
    expect(result.current[0]).toBe("dark")
    expect(JSON.parse(window.localStorage.getItem("chub.settings")!)).toMatchObject({ "appearance.theme": "dark" })
  })

  it("updates subscribed values from the storage event", async () => {
    const store = await loadStore()
    const { result } = renderHook(() => store.usePreference("appearance.theme"))
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "chub.settings", newValue: JSON.stringify({ "appearance.theme": "light" }),
    })))
    expect(result.current[0]).toBe("light")
  })

  it("keeps the session working when storage throws", async () => {
    const store = await loadStore()
    vi.spyOn(testStorage, "getItem").mockImplementation(() => { throw new Error("denied") })
    vi.spyOn(testStorage, "setItem").mockImplementation(() => { throw new Error("denied") })
    const { result } = renderHook(() => store.usePreference("appearance.theme"))
    expect(() => act(() => result.current[1]("dark"))).not.toThrow()
    expect(result.current[0]).toBe("dark")
  })

  it("adopts valid legacy settings only when the namespaced object is absent", async () => {
    window.localStorage.setItem("chub-theme", "dark")
    window.localStorage.setItem("chub.tasks.retention", JSON.stringify({ days: 30, scope: "completed" }))
    const store = await loadStore()
    const theme = renderHook(() => store.usePreference("appearance.theme"))
    const retention = renderHook(() => store.usePreference("modules.retention"))
    const scope = renderHook(() => store.usePreference("modules.retentionScope"))
    expect(theme.result.current[0]).toBe("dark")
    expect(retention.result.current[0]).toBe("30")
    expect(scope.result.current[0]).toBe("completed")
    expect(window.localStorage.getItem("chub-theme")).toBe("dark")
    expect(window.localStorage.getItem("chub.tasks.retention")).not.toBeNull()

    window.localStorage.setItem("chub.settings", JSON.stringify({ "appearance.theme": "light" }))
    const existing = await loadStore()
    expect(renderHook(() => existing.usePreference("appearance.theme")).result.current[0]).toBe("light")
  })

  it("uses defaults for invalid legacy values", async () => {
    window.localStorage.setItem("chub-theme", "ultraviolet")
    window.localStorage.setItem("chub.tasks.retention", JSON.stringify({ days: 3, scope: "all" }))
    const store = await loadStore()
    expect(renderHook(() => store.usePreference("appearance.theme")).result.current[0]).toBe("atripp")
    expect(renderHook(() => store.usePreference("modules.retention")).result.current[0]).toBe("never")
    // A corrupt window must not also lose the wider scope the user picked.
    expect(renderHook(() => store.usePreference("modules.retentionScope")).result.current[0]).toBe("all")
  })

  it("loads and writes workspace preferences through the API", async () => {
    api.fetchPreferences.mockResolvedValue({ "modules.retention": "30" })
    const store = await loadStore()
    const { result } = renderHook(() => store.usePreference("modules.retention"))
    expect(result.current[0]).toBe("never")
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current[0]).toBe("30")
    act(() => result.current[1]("15"))
    expect(result.current[0]).toBe("15")
    expect(api.savePreference).toHaveBeenCalledWith("modules.retention", "15")
  })

  it("never interprets corrupt or missing retention as a shorter window", async () => {
    // A *valid* stored window is the user's choice and is honoured through the offline mirror; the property this
    // test guards is that a corrupt or absent one can never become a deletion window.
    window.localStorage.setItem(
      "chub.settings",
      JSON.stringify({ "modules.retention": "banana", "modules.retentionScope": "sideways" }),
    )
    const store = await loadStore()
    expect(renderHook(() => store.usePreference("modules.retention")).result.current[0]).toBe("never")
    // A corrupt window must not also lose the scope the user picked.
    expect(renderHook(() => store.usePreference("modules.retentionScope")).result.current[0]).toBe("completed")
    expect(store.defaultOf("modules.retention")).toBe("never")
  })

  it("restores a mirrored workspace preference after reload and uploads it", async () => {
    window.localStorage.setItem("chub.settings", JSON.stringify({ "modules.retention": "30" }))
    api.fetchPreferences.mockResolvedValue({})
    const store = await loadStore()

    expect(renderHook(() => store.usePreference("modules.retention")).result.current[0]).toBe("30")
    await act(async () => { await store.whenWorkspacePreferencesLoaded() })
    expect(api.savePreference).toHaveBeenCalledWith("modules.retention", "30")
  })

  it("prefers the server workspace value over its device mirror", async () => {
    window.localStorage.setItem("chub.settings", JSON.stringify({ "modules.retention": "30" }))
    api.fetchPreferences.mockResolvedValue({ "modules.retention": "7" })
    const store = await loadStore()
    const { result } = renderHook(() => store.usePreference("modules.retention"))

    await act(async () => { await store.whenWorkspacePreferencesLoaded() })
    expect(result.current[0]).toBe("7")
    expect(api.savePreference).not.toHaveBeenCalledWith("modules.retention", expect.anything())
  })

  it("adopts legacy settings when the namespaced object is corrupt", async () => {
    window.localStorage.setItem("chub.settings", "{oops")
    window.localStorage.setItem("chub-theme", "dark")
    const store = await loadStore()

    expect(renderHook(() => store.usePreference("appearance.theme")).result.current[0]).toBe("dark")
  })
})
