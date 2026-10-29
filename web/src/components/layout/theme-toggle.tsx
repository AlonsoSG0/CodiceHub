import { Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/app/theme-provider";
import { useT } from "@/i18n";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useT();
  const label = t(theme === "light" ? "shell.theme.switchToDark" : theme === "dark" ? "shell.theme.switchToAtripp" : "shell.theme.switchToLight");

  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={toggleTheme}>
      {theme === "light" ? <Sun size={16} aria-hidden="true" /> : theme === "dark" ? <Moon size={16} aria-hidden="true" /> : <Palette size={16} aria-hidden="true" />}
    </Button>
  );
}
