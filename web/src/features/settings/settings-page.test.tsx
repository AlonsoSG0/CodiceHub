import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { preferences } from "./preferences"
import { SettingsPage } from "./settings-page"

const api = vi.hoisted(() => ({ fetchPreferences: vi.fn(), savePreference: vi.fn(), fetchBackups: vi.fn(), createBackup: vi.fn(), restoreBackup: vi.fn() }))
vi.mock("@/lib/api", () => api)

let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, String(value)) },
      removeItem: (key: string) => { storage.delete(key) },
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() { return storage.size },
    } as Storage,
  })
  api.fetchPreferences.mockReset().mockResolvedValue({})
  api.savePreference.mockReset().mockResolvedValue({})
  api.fetchBackups.mockReset().mockResolvedValue([])
  api.createBackup.mockReset().mockResolvedValue({})
  api.restoreBackup.mockReset().mockRejectedValue(new Error("test"))
})
afterEach(cleanup)

function renderPage() {
  return render(<MemoryRouter><SettingsPage /></MemoryRouter>)
}

describe("settings page", () => {
  it("lists, creates and confirms restoring backups", async () => {
    const backup = { name: "chub-20260101-120000.db", bytes: 2048, createdAt: "2026-01-01T12:00:00Z" }
    api.fetchBackups.mockResolvedValue([backup])
    renderPage()
    expect(await screen.findByText(backup.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Back up now" }))
    await waitFor(() => expect(api.createBackup).toHaveBeenCalledOnce())
    await waitFor(() => expect(api.fetchBackups).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole("button", { name: "Restore" }))
    expect(await screen.findByText(/current state will be backed up first/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }))
    await waitFor(() => expect(api.restoreBackup).toHaveBeenCalledWith(backup.name))
  })
  it("renders every registry group", () => {
    renderPage()
    for (const group of [...new Set(preferences.map(({ group }) => group))]) {
      expect(screen.getByRole("heading", { name: group })).toBeInTheDocument()
    }
    for (const { label } of preferences) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it("persists a theme selection to chub.settings", async () => {
    renderPage()
    fireEvent.click(screen.getByRole("combobox", { name: "Theme" }))
    const darkOption = await screen.findByRole("option", { name: "dark" })
    fireEvent.pointerDown(darkOption, { button: 0, pointerType: "mouse" })
    fireEvent.pointerUp(darkOption, { button: 0, pointerType: "mouse" })
    fireEvent.click(darkOption)
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem("chub.settings")!)["appearance.theme"]).toBe("dark")
    })
  })

  it("updates module order and toggles visibility in the stored preference", async () => {
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: "Move Habits up" }))
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem("chub.settings")!)["nav.modules"].order.slice(0, 2)).toEqual(["habits", "notes"])
    })

    fireEvent.click(screen.getByRole("button", { name: "Hide Routine" }))
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem("chub.settings")!)["nav.modules"]).toMatchObject({
        order: ["habits", "notes", "routine", "books", "projects", "tasks", "goals"],
        hidden: ["routine"],
      })
    })
  })

  it("saves the selected time zone through the workspace preference", async () => {
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: /time zone:/i }))
    fireEvent.change(screen.getByRole("textbox", { name: "Search time zones" }), { target: { value: "new york" } })
    const zone = await screen.findByRole("menuitemradio", { name: /New York/ })
    fireEvent.click(zone)

    await waitFor(() => expect(api.savePreference).toHaveBeenCalledWith("workspace.timezone", "America/New_York"))
  })

  it("writes workspace settings through savePreference", async () => {
    renderPage()
    const field = screen.getByRole("textbox", { name: "Reading habit" })
    fireEvent.change(field, { target: { value: "Daily reading" } })
    await waitFor(() => expect(api.savePreference).toHaveBeenCalledWith("modules.readingHabit", "Daily reading"))
  })

  it("shows the brand and the workspace version at the end", () => {
    renderPage()
    expect(screen.getByText("CodiceHub")).toBeInTheDocument()
    // The version is __APP_VERSION__, injected by vite.config.ts from the root package.json.
    expect(screen.getByText(/^\d+\.\d+\.\d+$/)).toBeInTheDocument()
  })
})
