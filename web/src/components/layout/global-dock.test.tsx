import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"

const api = vi.hoisted(() => ({ fetchPreferences: vi.fn(), savePreference: vi.fn() }))
vi.mock("@/lib/api", () => api)

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
  api.fetchPreferences.mockReset().mockResolvedValue({})
  api.savePreference.mockReset().mockResolvedValue({})
})
afterEach(cleanup)

async function renderDock(path = "/") {
  vi.resetModules()
  const { GlobalDock } = await import("./global-dock")
  return render(<MemoryRouter initialEntries={[path]}><GlobalDock /></MemoryRouter>)
}

const dockLabels = () => [...screen.getByRole("generic", { name: "Section dock" }).querySelectorAll("a")]
  .map((link) => link.getAttribute("aria-label"))

 describe("global dock", () => {
  it("follows nav.modules order and always keeps Home centered and Settings at the end", async () => {
    window.localStorage.setItem("chub.settings", JSON.stringify({ "nav.modules": { order: ["goals", "notes", "tasks"], hidden: ["habits", "routine", "books", "projects"] } }))
    await renderDock()

    expect(dockLabels()).toEqual(["Goals", "Notes", "Home", "Tasks", "Settings"])
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument()
    // The home entry is the brand isotipo, not a lucide icon.
    expect(screen.getByRole("link", { name: "Home" }).querySelector("img")).toHaveAttribute(
      "src",
      "/brand/CodiceHub_Isotipo.png",
    )
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
  })

  it("omits a hidden module from the dock without changing its route", async () => {
    window.localStorage.setItem("chub.settings", JSON.stringify({ "nav.modules": { order: ["notes", "books"], hidden: ["habits"] } }))
    await renderDock()

    expect(screen.queryByRole("link", { name: "Habits" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument()
  })

  it("shows sections registered after a legacy navigation preference was saved", async () => {
    window.localStorage.setItem("chub.settings", JSON.stringify({ "nav.modules": ["notes", "habits", "books", "projects", "tasks", "goals"] }))
    await renderDock()

    expect(screen.getByRole("link", { name: "Routine" })).toHaveAttribute("href", "/routine")
    expect(dockLabels()).toContain("Routine")
  })

  it("keeps Home visible and does not peek there when dock is unpinned", async () => {
    await renderDock("/")

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument()
    expect(document.querySelector(".translate-y-\\[calc\\(100\\%-14px\\)\\]" )).not.toBeInTheDocument()
  })

  it("shows the peek transform off Home when the dock is not pinned", async () => {
    await renderDock("/notes")

    expect(document.querySelector(".translate-y-\\[calc\\(100\\%-14px\\)\\]" )).toBeInTheDocument()
  })

  it("renders without the peek transform on every route when nav.dockPinned is true", async () => {
    window.localStorage.setItem("chub.settings", JSON.stringify({ "nav.dockPinned": true }))
    await renderDock("/notes")

    expect(document.querySelector(".translate-y-\\[calc\\(100\\%-14px\\)\\]" )).not.toBeInTheDocument()
  })

  it("publishes its measured height for the pages that must clear it, and clears it on unmount", async () => {
    // jsdom has no layout engine: the height the dock reports to the hook is provided here.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 102 })
    try {
      const { unmount } = await renderDock("/notes")

      expect(document.documentElement.style.getPropertyValue("--dock-clearance")).toBe("102px")

      unmount()
      expect(document.documentElement.style.getPropertyValue("--dock-clearance")).toBe("")
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original)
    }
  })
})
