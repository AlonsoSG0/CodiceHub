export type Language = "en" | "es";

/** One domain owns its own keys in both languages, so two translators never edit the same file. */
export type DomainMessages = { en: Record<string, string>; es: Record<string, string> };
