import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/app/theme-provider";
import { setPreference, usePreference } from "@/features/settings/preferences";

function AppearanceProbe() {
  const { theme, toggleTheme } = useTheme();
  const [density] = usePreference("appearance.density");
  const [motion] = usePreference("appearance.motion");

  return (
    <>
      <span data-testid="theme">{theme}</span>
      <span data-testid="density">{String(density)}</span>
      <span data-testid="motion">{String(motion)}</span>
      <button type="button" onClick={toggleTheme}>Toggle theme</button>
    </>
  );
}

function renderAppearance() {
  return render(<ThemeProvider><AppearanceProbe /></ThemeProvider>);
}

let mediaQuery: MediaQueryList;
let mediaChange: ((event: MediaQueryListEvent) => void) | undefined;
const storageValues = new Map<string, string>();
const testStorage: Storage = {
  get length() { return storageValues.size; },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => storageValues.delete(key),
  setItem: (key, value) => storageValues.set(String(key), String(value)),
};

beforeEach(() => {
  storageValues.clear();
  Object.defineProperty(window, "localStorage", { configurable: true, value: testStorage });
  mediaChange = undefined;
  mediaQuery = {
    matches: false,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: (this: MediaQueryList, event: MediaQueryListEvent) => unknown) => {
      mediaChange = listener as (event: MediaQueryListEvent) => void;
    },
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
  document.documentElement.classList.remove("dark", "light", "atripp");
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("appearance preferences", () => {
  it.each(["light", "dark", "atripp"] as const)("resolves explicit %s theme", (theme) => {
    setPreference("appearance.theme", theme);

    renderAppearance();

    expect(screen.getByTestId("theme").textContent).toBe(theme);
    expect(document.documentElement.classList.contains(theme)).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe(theme === "light" ? "light" : "dark");
  });

  it("follows the system color scheme while system is selected", () => {
    setPreference("appearance.theme", "system");
    mediaQuery = { ...mediaQuery, matches: false };
    vi.mocked(window.matchMedia).mockImplementation(() => mediaQuery);

    renderAppearance();
    expect(screen.getByTestId("theme").textContent).toBe("light");

    Object.defineProperty(mediaQuery, "matches", { configurable: true, value: true });
    act(() => mediaChange?.({ matches: true } as MediaQueryListEvent));
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("cycles light, dark and atripp without leaving stale classes", () => {
    setPreference("appearance.theme", "light");
    renderAppearance();

    for (const [next, previous, scheme] of [["dark", "light", "dark"], ["atripp", "dark", "dark"], ["light", "atripp", "light"]] as const) {
      fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
      expect(screen.getByTestId("theme").textContent).toBe(next);
      expect(document.documentElement.classList.contains(next)).toBe(true);
      expect(document.documentElement.classList.contains(previous)).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe(scheme);
    }
  });

  it("writes the next resolved theme through the preference store", () => {
    setPreference("appearance.theme", "system");
    Object.defineProperty(mediaQuery, "matches", { configurable: true, value: true });
    vi.mocked(window.matchMedia).mockImplementation(() => mediaQuery);
    renderAppearance();

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(screen.getByTestId("theme").textContent).toBe("atripp");
    expect(window.localStorage.getItem("chub.settings")).toContain('"appearance.theme":"atripp"');
    expect(window.localStorage.getItem("chub-theme")).toBeNull();
  });

  it("applies density and motion attributes initially and when preferences change", () => {
    setPreference("appearance.density", "compact");
    setPreference("appearance.motion", "system");
    const { rerender } = renderAppearance();

    expect(document.documentElement).toHaveAttribute("data-density", "compact");
    expect(document.documentElement).toHaveAttribute("data-motion", "system");

    setPreference("appearance.density", "comfortable");
    setPreference("appearance.motion", "reduced");
    rerender(<ThemeProvider><AppearanceProbe /></ThemeProvider>);

    expect(document.documentElement).toHaveAttribute("data-density", "comfortable");
    expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
  });
});
