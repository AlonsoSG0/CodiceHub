import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePreference } from "@/features/settings/preferences";

export type Theme = "light" | "dark" | "atripp";
type ThemePreference = Theme | "system";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemTheme(): Theme {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [storedPreference, setStoredPreference] = usePreference("appearance.theme");
  const preference = storedPreference as ThemePreference;
  const [density] = usePreference("appearance.density");
  const [motion] = usePreference("appearance.motion");
  const [systemTheme, setSystemTheme] = useState<Theme>(readSystemTheme);
  const theme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    if (preference !== "system" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener?.("change", updateSystemTheme);
    return () => mediaQuery.removeEventListener?.("change", updateSystemTheme);
  }, [preference]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("atripp", theme === "atripp");
    root.style.colorScheme = theme === "light" ? "light" : "dark";
  }, [theme]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.density = String(density);
    root.dataset.motion = String(motion);
  }, [density, motion]);

  const toggleTheme = useCallback(() => {
    setStoredPreference(theme === "light" ? "dark" : theme === "dark" ? "atripp" : "light");
  }, [setStoredPreference, theme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
