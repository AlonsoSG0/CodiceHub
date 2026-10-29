import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { ThemeProvider } from "@/app/theme-provider"
import { Clock } from "./clock"
import { HomePage } from "./home-page"
import { Button } from "@/components/ui/button"

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

const storageValues = new Map<string, string>()
// SAFETY: Node 25 ships a global `localStorage` that shadows jsdom's and lacks the full Storage surface, so the theme test installs the same explicit stub App.test.tsx uses.
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    get length() { return storageValues.size },
    clear: () => storageValues.clear(),
    getItem: (key: string) => storageValues.get(key) ?? null,
    key: (index: number) => [...storageValues.keys()][index] ?? null,
    removeItem: (key: string) => { storageValues.delete(key) },
    setItem: (key: string, value: string) => { storageValues.set(String(key), String(value)) },
  },
})

Object.defineProperty(window, "requestAnimationFrame", {
  writable: true,
  value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16),
})
Object.defineProperty(window, "cancelAnimationFrame", {
  writable: true,
  value: (id: number) => window.clearTimeout(id),
})

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
} as unknown as typeof IntersectionObserver

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Home", () => {
  it("renders the current local time using the browser locale", () => {
    const now = new Date("2026-04-05T14:07:09.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)

    render(<Clock aria-label="Local time" />)

    const clock = screen.getByLabelText("Local time")
    const expected = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(now)
    expect(clock.textContent).toBe(expected)
    expect(clock.getAttribute("datetime")).toBe(now.toISOString())
  })

  it("advances the clock when one second elapses", () => {
    const now = new Date("2026-04-05T14:07:09.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)

    render(<Clock aria-label="Local time" />)
    const clock = screen.getByLabelText("Local time")
    const before = clock.textContent

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(clock.textContent).toBe(new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(now.getTime() + 1000)))
    expect(clock.textContent).not.toBe(before)
  })

  it("renders the welcome home callout", () => {
    render(<ThemeProvider><MemoryRouter><HomePage /></MemoryRouter></ThemeProvider>)

    expect(screen.getByRole("note").textContent).toContain("Welcome home")
  })

  it("shows the decorative orbit only in atripp", () => {
    window.localStorage.clear()
    const { container } = render(<ThemeProvider><MemoryRouter><HomePage /></MemoryRouter></ThemeProvider>)
    const orbit = () => container.querySelector('svg[data-home-decoration]')
    expect(orbit()).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }))
    expect(orbit()).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Switch to Atripp theme" }))
    expect(orbit()).toHaveAttribute("aria-hidden", "true")
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }))
    expect(orbit()).toBeNull()
  })

  it("identifies button variants without changing their existing classes", () => {
    render(<><Button>Primary</Button><Button variant="secondary">Secondary</Button></>)
    expect(screen.getByRole("button", { name: "Primary" })).toHaveAttribute("data-variant", "default")
    expect(screen.getByRole("button", { name: "Secondary" })).toHaveAttribute("data-variant", "secondary")
    expect(screen.getByRole("button", { name: "Secondary" })).toHaveClass("bg-secondary")
  })

  it("offers the same theme toggle the notes screen has, and switches the theme", () => {
    window.localStorage.clear()
    document.documentElement.classList.remove("dark", "light")
    render(<ThemeProvider><MemoryRouter><HomePage /></MemoryRouter></ThemeProvider>)

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }))

    expect(screen.getByRole("button", { name: "Switch to Atripp theme" })).toBeTruthy()
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
})
