import { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { Dock, DockIcon } from "@/components/magicui/dock";
import { canonicalSectionOrder, sections } from "@/app/sections";
import { usePreference } from "@/features/settings/preferences";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { useDockClearance } from "./use-dock-clearance";

export function GlobalDock() {
  const { t } = useT();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [modulePreference] = usePreference("nav.modules");
  const [dockPinned] = usePreference("nav.dockPinned");
  const modules = modulePreference && typeof modulePreference === "object" && !Array.isArray(modulePreference)
    ? modulePreference as { order: string[]; hidden: string[] }
    : { order: [], hidden: [] };
  const visibleSections = canonicalSectionOrder(modules.order)
    // Visibility must be explicit: order omits sections added since it was saved, not necessarily sections the user hid.
    .filter((id) => !modules.hidden.includes(id))
    .map((id) => sections.find((section) => section.id === id))
    .filter((section) => section !== undefined);
  const homePosition = Math.ceil(visibleSections.length / 2);
  const dockItems = [
    ...visibleSections.slice(0, homePosition).map((section) => ({ ...section, label: t(`shell.section.${section.id}`) })),
    // The home entry carries the brand isotipo instead of a lucide icon: the dock's center is CodiceHub itself.
    { id: "home", label: t("shell.section.home"), href: "/", shortcut: t("shell.homeShortcut") },
    ...visibleSections.slice(homePosition).map((section) => ({ ...section, label: t(`shell.section.${section.id}`) })),
    { id: "settings", label: t("shell.section.settings"), href: "/settings", icon: SettingsIcon },
  ];
  const keepVisible = isHome || dockPinned === true;
  // The dock floats over the page, so it measures itself and publishes the room a page has to keep below its last line.
  const dockRef = useRef<HTMLDivElement>(null);
  useDockClearance(dockRef);

  return (
    <div ref={dockRef} className="fixed bottom-0 left-1/2 z-50 -translate-x-1/2 pb-3">
      <div
        className={cn(
          "transition-transform duration-300 ease-out",
          keepVisible ? "translate-y-0" : "translate-y-[calc(100%-14px)] hover:translate-y-0",
        )}
      >
        <Dock
          className="border-border bg-background/90 shadow-xl"
          aria-label={t("shell.dock")}
        >
          {dockItems.map(({ id, label, href, icon: Icon, shortcut }) => (
            <DockIcon key={id} aria-label={shortcut ? `${label} (${shortcut})` : label}>
              <Link
                to={href}
                title={shortcut ? `${label} (${shortcut})` : label}
                aria-label={label}
                className="flex size-full flex-col items-center justify-center gap-1 text-foreground"
              >
              {id === "home" ? (
                <img
                  src="/brand/CodiceHub_Isotipo.png"
                  alt=""
                  aria-hidden="true"
                  className="size-6 rounded-[5px] object-contain"
                />
              ) : (
                Icon && <Icon className="size-6" aria-hidden="true" />
              )}
                <span className="text-xs">{label}</span>
              </Link>
            </DockIcon>
          ))}
        </Dock>
      </div>
    </div>
  );
}
