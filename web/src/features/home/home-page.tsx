import { useTheme } from "@/app/theme-provider"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { LanguageToggle } from "@/components/layout/language-toggle"
import { useT } from "@/i18n"
import { Callout } from "@/components/mdxcn/callout"
import { Clock } from "./clock"
import { HomeDecoration } from "./home-decoration"

export function HomePage() {
  const { t } = useT()
  const { theme } = useTheme()
  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center justify-center gap-8 overflow-hidden px-6 pb-28 text-center">
      {theme === "atripp" && <HomeDecoration />}
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <section aria-label={t("home.time")} className="relative flex flex-col items-center">
        <p className="mb-3 text-sm uppercase tracking-[.3em] text-muted-foreground">
          {t("home.intro")}
        </p>
        <Clock aria-label={t("home.localTime")} className="text-6xl sm:text-8xl" />
      </section>

      <Callout type="tip" title={t("home.welcome")} className="max-w-xl text-left">
        {t("home.message")}
      </Callout>

    </main>
  )
}
