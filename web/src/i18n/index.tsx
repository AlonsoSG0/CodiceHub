/*
 * Translation for the whole app.
 *
 * English is the default and also the fallback: `useT()` outside a provider answers English, and a key missing from the
 * Spanish catalogue falls back to the English one. That keeps every existing test running unchanged — they render
 * components without a provider and read English — while a half-translated surface degrades to English instead of
 * rendering a blank or a raw key.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePreference } from "@/features/settings/preferences";
import { messages, type Language } from "./messages";

export type { Language } from "./messages";

export const defaultLanguage: Language = "en";

/** `en-US`/`es-MX` rather than a bare code, so `Intl` picks the right weekday and date shapes. */
export const locales: Record<Language, string> = { en: "en-US", es: "es-MX" };

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export type I18n = {
  language: Language;
  locale: string;
  t: Translate;
};

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (values === undefined) return template;
  return template.replaceAll(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

function translate(language: Language): Translate {
  const catalogue = messages[language];
  const fallback = messages.en;
  return (key, values) => interpolate(catalogue[key] ?? fallback[key] ?? key, values);
}

const englishOnly: I18n = { language: defaultLanguage, locale: locales[defaultLanguage], t: translate(defaultLanguage) };

const I18nContext = createContext<I18n>(englishOnly);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [value] = usePreference("appearance.language");
  const language: Language = value === "es" ? "es" : "en";
  const current = useMemo<I18n>(
    () => ({ language, locale: locales[language], t: translate(language) }),
    [language],
  );

  return <I18nContext.Provider value={current}>{children}</I18nContext.Provider>;
}

export function useT(): I18n {
  return useContext(I18nContext);
}
