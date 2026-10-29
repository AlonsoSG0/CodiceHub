/*
 * The language switch that sits beside the theme switch.
 *
 * It writes the device preference, so the choice survives a reload without a server round trip of its own, and it
 * announces what it will switch to in the language currently on screen.
 */

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreference } from "@/features/settings/preferences";
import { useT, type Language } from "@/i18n";

export function LanguageToggle() {
  const [value, setValue] = usePreference("appearance.language");
  const { language, t } = useT();
  const current: Language = value === "es" ? "es" : "en";
  const next: Language = current === "en" ? "es" : "en";
  const label = next === "es" ? t("shell.language.switchToSpanish") : t("shell.language.switchToEnglish");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label={label}
      title={label}
      onClick={() => setValue(next)}
    >
      <Languages aria-hidden="true" />
      <span className="sr-only">{current.toUpperCase()}</span>
    </Button>
  );
}
